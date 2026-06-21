import axios from "axios";
import { DragEvent, useEffect, useRef, useState } from "react";

const API_BASE_URL = "/api";
const MAX_CONTEXT_FILES = 4;
const MAX_CONTEXT_SIZE_BYTES = 20_000;

interface UploadedContext {
  filename: string;
  content: string;
}

interface AIEditOperation {
  type: "replace_block" | "delete_block" | "insert_after" | "insert_before";
  target_block_id: string;
  html: string | null;
}

interface AIEditResponse {
  status: "applied" | "needs_clarification" | "refused";
  summary: string;
  content: string;
  operations: AIEditOperation[];
  clarifying_question: string | null;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AIEditorPanelProps {
  documentId: number;
  versionId: number | null;
  content: string;
  onContentUpdated: (content: string) => void;
}

export default function AIEditorPanel({
  documentId,
  versionId,
  content,
  onContentUpdated,
}: AIEditorPanelProps) {
  const [instruction, setInstruction] = useState("");
  const [uploadedContexts, setUploadedContexts] = useState<UploadedContext[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const canSend = Boolean(documentId && versionId && instruction.trim() && !isEditing);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isEditing]);

  const addAssistantMessage = (message: string) => {
    setMessages((currentMessages) => [
      ...currentMessages,
      { role: "assistant", content: message },
    ]);
  };

  const sendInstruction = async () => {
    if (!documentId || !versionId || !instruction.trim()) {
      return;
    }

    const submittedInstruction = instruction.trim();
    setInstruction("");
    setMessages((currentMessages) => [
      ...currentMessages,
      { role: "user", content: submittedInstruction },
    ]);
    setErrorMessage("");
    setIsEditing(true);

    try {
      const response = await axios.post<AIEditResponse>(`${API_BASE_URL}/ai/edit`, {
        document_id: documentId,
        version_id: versionId,
        content,
        instruction: submittedInstruction,
        uploaded_contexts: uploadedContexts,
      });

      if (response.data.status === "applied") {
        onContentUpdated(response.data.content);
        addAssistantMessage(response.data.summary);
      } else if (response.data.status === "needs_clarification") {
        addAssistantMessage(
          response.data.clarifying_question ?? response.data.summary
        );
      } else {
        addAssistantMessage(response.data.summary);
      }
    } catch (error) {
      console.error("Error applying AI edit:", error);
      setErrorMessage("The AI edit could not be applied safely.");
    } finally {
      setIsEditing(false);
    }
  };

  const readTextFile = async (file: File): Promise<UploadedContext> => {
    if (!file.name.toLowerCase().endsWith(".txt")) {
      throw new Error("Only .txt files can be uploaded.");
    }
    if (file.type && file.type !== "text/plain") {
      throw new Error("Uploaded context must be a plain text file.");
    }
    if (file.size > MAX_CONTEXT_SIZE_BYTES) {
      throw new Error("Context files must be 20 KB or smaller.");
    }
    if (uploadedContexts.some((context) => context.filename === file.name)) {
      throw new Error("That context file has already been added.");
    }
    const content = await file.text();
    if (!content.trim()) {
      throw new Error("Context files cannot be empty.");
    }
    return {
      filename: file.name,
      content,
    };
  };

  const handleFiles = async (files: FileList) => {
    setErrorMessage("");
    try {
      const availableSlots = MAX_CONTEXT_FILES - uploadedContexts.length;
      if (availableSlots <= 0) {
        throw new Error("Remove a context file before adding another.");
      }
      if (files.length > availableSlots) {
        throw new Error(`You can attach up to ${MAX_CONTEXT_FILES} context files.`);
      }
      const selectedFiles = Array.from(files).slice(0, availableSlots);
      const contexts = await Promise.all(selectedFiles.map(readTextFile));
      setUploadedContexts((currentContexts) => [
        ...currentContexts,
        ...contexts,
      ]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not read the uploaded file."
      );
    }
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    await handleFiles(event.dataTransfer.files);
  };

  const removeContext = (filename: string) => {
    setUploadedContexts((currentContexts) =>
      currentContexts.filter((context) => context.filename !== filename)
    );
  };

  return (
    <section className="ai-panel" aria-label="AI document editor">
      <div className="ai-panel-header">
        <h3>AI Editor</h3>
        <span>{uploadedContexts.length}/{MAX_CONTEXT_FILES} files</span>
      </div>
      <div className="ai-messages">
        {messages.length === 0 ? (
          <p className="ai-empty">Ask for a specific patent edit.</p>
        ) : (
          messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`ai-message ${message.role}`}>
              {message.content}
            </div>
          ))
        )}
        {isEditing && <div className="ai-message assistant">Applying edit...</div>}
        <div ref={messagesEndRef} />
      </div>

      <div
        className="ai-dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <span>Drop .txt context</span>
        <input
          type="file"
          accept=".txt"
          multiple
          onChange={(event) => {
            if (event.target.files) {
              void handleFiles(event.target.files);
            }
            event.target.value = "";
          }}
        />
      </div>

      {uploadedContexts.length > 0 && (
        <div className="ai-context-list">
          {uploadedContexts.map((context) => (
            <button
              key={context.filename}
              type="button"
              onClick={() => removeContext(context.filename)}
              title="Remove context file"
            >
              {context.filename}
            </button>
          ))}
        </div>
      )}

      <textarea
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        placeholder="Make claim 1 bold"
        rows={4}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            void sendInstruction();
          }
        }}
      />
      {errorMessage && <div className="ai-error">{errorMessage}</div>}
      <button onClick={sendInstruction} disabled={!canSend}>
        {isEditing ? "Applying" : "Apply AI Edit"}
      </button>
    </section>
  );
}
