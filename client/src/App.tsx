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
  const [currentDocumentId, setCurrentDocumentId] = useState<number>(0);
  const [currentVersionId, setCurrentVersionId] = useState<number | null>(null);
  const [versions, setVersions] = useState<DocumentVersionMetadata[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const applyDocumentResponse = useCallback((document: DocumentResponse) => {
    setCurrentDocumentContent(document.content);
    setCurrentDocumentId(document.id);
    setCurrentVersionId(document.current_version.id);
    setVersions(document.versions);
  }, []);

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
    await loadPatent(currentDocumentId, versionId);
  };

  // Callback to persist a patent in the DB
  const savePatent = async () => {
    if (!currentDocumentId || currentVersionId === null) {
      return;
    }
    setIsLoading(true);
    setErrorMessage("");
    try {
      await axios.put(
        `${API_BASE_URL}/document/${currentDocumentId}/versions/${currentVersionId}`,
        {
          content: currentDocumentContent,
        }
      );
    } catch (error) {
      console.error("Error saving document:", error);
      setErrorMessage("Could not save this version. Check that the server is running.");
    } finally {
      setIsLoading(false);
    }
  };

  const createVersion = async () => {
    if (!currentDocumentId) {
      return;
    }
    setIsLoading(true);
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
    } catch (error) {
      console.error("Error creating document version:", error);
      setErrorMessage("Could not create a version. Check that the server is running.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full">
      {isLoading && <LoadingOverlay />}
      <header className="flex items-center justify-center top-0 w-full bg-black text-white text-center z-50 mb-[30px] h-[80px]">
        <img src={Logo} alt="Logo" style={{ height: "50px" }} />
      </header>
      <div className="flex w-full bg-white h-[calc(100%-100px)] gap-4 justify-center box-shadow">
        <div className="flex flex-col h-full items-center gap-2 px-4">
          <button onClick={() => loadPatent(1)}>Patent 1</button>
          <button onClick={() => loadPatent(2)}>Patent 2</button>
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
          <Document
            onContentChange={setCurrentDocumentContent}
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
            onContentUpdated={setCurrentDocumentContent}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
