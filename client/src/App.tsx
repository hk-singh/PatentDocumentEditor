import Document from "./Document";
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import LoadingOverlay from "./LoadingOverlay";
import Logo from "./assets/logo.png";
import AIEditorPanel from "./AIEditorPanel";

const API_BASE_URL = "/api";

interface DocumentVersionMetadata {
  id: number;
  document_id: number;
  version_number: number;
  revision: number;
}

interface DocumentVersionRead extends DocumentVersionMetadata {
  content: string;
}

interface DocumentResponse {
  id: number;
  content: string;
  current_version: DocumentVersionRead;
  versions: DocumentVersionMetadata[];
}

function App() {
  const [currentDocumentContent, setCurrentDocumentContent] =
    useState<string>("");
  const [lastSavedContent, setLastSavedContent] = useState<string>("");
  const [currentDocumentId, setCurrentDocumentId] = useState<number>(0);
  const [currentVersionId, setCurrentVersionId] = useState<number | null>(null);
  const [currentVersionRevision, setCurrentVersionRevision] = useState<number | null>(null);
  const [versions, setVersions] = useState<DocumentVersionMetadata[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "dirty" | "saving" | "saved" | "conflict" | "error"
  >("idle");
  const isDirty = currentDocumentContent !== lastSavedContent;

  const applyDocumentResponse = useCallback((document: DocumentResponse) => {
    setCurrentDocumentContent(document.content);
    setLastSavedContent(document.content);
    setCurrentDocumentId(document.id);
    setCurrentVersionId(document.current_version.id);
    setCurrentVersionRevision(document.current_version.revision);
    setVersions(document.versions);
    setSaveStatus("idle");
  }, []);

  const confirmDiscardUnsavedChanges = useCallback(() => {
    return (
      !isDirty ||
      window.confirm("You have unsaved edits. Discard them and continue?")
    );
  }, [isDirty]);

  useEffect(() => {
    window.onbeforeunload = isDirty ? () => true : null;
    return () => {
      window.onbeforeunload = null;
    };
  }, [isDirty]);

  // Callback to load a patent from the backend
  const loadPatent = useCallback(
    async (documentNumber: number, versionId?: number) => {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const response = await axios.get(
          `${API_BASE_URL}/document/${documentNumber}`,
          {
            params:
              versionId !== undefined ? { version_id: versionId } : undefined,
          }
        );
        applyDocumentResponse(response.data);
      } catch (error) {
        console.error("Error loading document:", error);
        setErrorMessage("Could not load the patent. Check that the server is running.");
      } finally {
        setIsLoading(false);
      }
    },
    [applyDocumentResponse]
  );

  // Load the first patent on mount
  useEffect(() => {
    loadPatent(1);
  }, [loadPatent]);

  const loadVersion = async (versionId: number) => {
    if (!currentDocumentId) {
      return;
    }
    if (!confirmDiscardUnsavedChanges()) {
      return;
    }
    await loadPatent(currentDocumentId, versionId);
  };

  const selectPatent = async (documentNumber: number) => {
    if (!confirmDiscardUnsavedChanges()) {
      return;
    }
    await loadPatent(documentNumber);
  };

  // Callback to persist a patent in the DB
  const savePatent = async () => {
    if (
      !currentDocumentId ||
      currentVersionId === null ||
      currentVersionRevision === null
    ) {
      return;
    }
    setIsLoading(true);
    setSaveStatus("saving");
    setErrorMessage("");
    try {
      const response = await axios.put<DocumentVersionRead>(
        `${API_BASE_URL}/document/${currentDocumentId}/versions/${currentVersionId}`,
        {
          content: currentDocumentContent,
          base_revision: currentVersionRevision,
        }
      );
      setCurrentDocumentContent(response.data.content);
      setLastSavedContent(response.data.content);
      setCurrentVersionRevision(response.data.revision);
      setVersions((currentVersions) =>
        currentVersions.map((version) =>
          version.id === response.data.id
            ? { ...version, revision: response.data.revision }
            : version
        )
      );
      setSaveStatus("saved");
    } catch (error) {
      console.error("Error saving document:", error);
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        setSaveStatus("conflict");
        setErrorMessage(
          "This version changed elsewhere. Reload the version, review your edits, then save again."
        );
      } else {
        setSaveStatus("error");
        setErrorMessage("Could not save this version. Check that the server is running.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const createVersion = async () => {
    if (!currentDocumentId) {
      return;
    }
    setIsLoading(true);
    setSaveStatus("saving");
    setErrorMessage("");
    try {
      const versionResponse = await axios.post(
        `${API_BASE_URL}/document/${currentDocumentId}/versions`,
        {
          content: currentDocumentContent,
        }
      );
      const documentResponse = await axios.get(
        `${API_BASE_URL}/document/${currentDocumentId}`,
        {
          params: { version_id: versionResponse.data.id },
        }
      );
      applyDocumentResponse(documentResponse.data);
      setSaveStatus("saved");
    } catch (error) {
      console.error("Error creating document version:", error);
      setSaveStatus("error");
      setErrorMessage("Could not create a version. Check that the server is running.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleContentChange = (content: string) => {
    setCurrentDocumentContent(content);
    setSaveStatus(content === lastSavedContent ? "idle" : "dirty");
  };

  const saveStatusLabel =
    saveStatus === "saving"
      ? "Saving..."
      : saveStatus === "saved"
        ? "Saved"
        : saveStatus === "conflict"
          ? "Save conflict"
          : isDirty
            ? "Unsaved changes"
            : "All changes saved";

  return (
    <div className="flex flex-col h-full w-full">
      {isLoading && <LoadingOverlay />}
      <header className="flex items-center justify-center top-0 w-full bg-black text-white text-center z-50 mb-[30px] h-[80px]">
        <img src={Logo} alt="Logo" style={{ height: "50px" }} />
      </header>
      <div className="flex w-full bg-white h-[calc(100%-100px)] gap-4 justify-center box-shadow">
        <div className="flex flex-col h-full items-center gap-2 px-4">
          <button onClick={() => void selectPatent(1)}>Patent 1</button>
          <button onClick={() => void selectPatent(2)}>Patent 2</button>
        </div>
        <div className="flex flex-col h-full items-center gap-2 px-4 flex-1">
          <div className="flex w-full items-center justify-between gap-4">
            <h2 className="text-[#213547] opacity-60 text-2xl font-semibold">
              {currentDocumentId ? `Patent ${currentDocumentId}` : "Loading patent"}
            </h2>
            <label className="flex items-center gap-2 text-[#213547]">
              Version
              <select
                value={currentVersionId ?? ""}
                onChange={(event) => loadVersion(Number(event.target.value))}
                disabled={versions.length === 0}
              >
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {`Version ${version.version_number}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {errorMessage && (
            <div className="w-full rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}
          <div className={`save-status save-status-${saveStatus}`}>
            {saveStatusLabel}
          </div>
          <Document
            onContentChange={handleContentChange}
            content={currentDocumentContent}
          />
        </div>
        <div className="flex flex-col h-full items-stretch gap-2 px-4">
          <button onClick={createVersion} disabled={!currentDocumentId}>
            Create Version
          </button>
          <button onClick={savePatent} disabled={!currentVersionId}>
            Save
          </button>
          <AIEditorPanel
            documentId={currentDocumentId}
            versionId={currentVersionId}
            content={currentDocumentContent}
            onContentUpdated={handleContentChange}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
