# Task 1 Reviewer Notes

## Phase 1: Backend Model

- Added `DocumentVersion` as a first-class SQLAlchemy model linked to `Document`.
- Each document now has ordered versions with unique `(document_id, version_number)`.
- Seed data creates version 1 for both sample patents instead of storing mutable content directly on `Document`.

## Phase 2: Backend API

- `GET /document/{document_id}` now returns selected document content plus available version metadata. It defaults to the latest version and accepts `version_id`.
- Added `GET /document/{document_id}/versions` for version lists.
- Added `GET /document/{document_id}/versions/{version_id}` for loading a specific version.
- Added `POST /document/{document_id}/versions` for creating a new version from submitted content, a source version, or the latest version.
- Added `PUT /document/{document_id}/versions/{version_id}` for saving edits to an existing version without creating another version.
- Kept `POST /save/{document_id}` as a compatibility route that saves the latest version.

## Phase 3: Frontend

- Added client-side version metadata and selected version state.
- Added a version selector beside the patent title.
- Added `Create Version`, which creates a new version from the current editor content and selects it.
- Updated `Save` to persist only the currently selected version.
- Added minimal styling for version selection and disabled buttons.
- Made the TipTap editor explicitly editable and styled the document area as a clear, focusable editing surface.

## Phase 4: Tests And Verification

- Added backend unit tests in `server/tests/test_document_versioning.py`.
- Covered seeded initial versions, creating versions, saving an existing version without mutating another version, and missing-document handling.
- Added `client/eslint.config.js` so the existing ESLint 9 dependency can run with the project lint script.

Verified with:

```bash
docker compose run --rm server uv run python -m unittest discover -s tests
npm run build
npm run lint
```

Note: `server/.env` is now ignored so local OpenAI credentials are not accidentally committed. A local placeholder env file was created only to allow Docker Compose verification in this workspace.

## Production Version Storage Consideration

The current implementation stores a full HTML snapshot for each document version. This keeps the challenge implementation simple, reliable, and easy to review, but it duplicates storage when users create many versions with small edits.

For production, a better long-term approach would be hybrid version storage:

- Store the first version as a full snapshot.
- Store later versions as deltas from a parent version.
- Periodically store full checkpoint snapshots, for example every 10 versions.
- Reconstruct a requested version on the server by starting from the nearest snapshot and applying deltas forward.

Suggested model direction:

```text
DocumentVersion
  id
  document_id
  version_number
  parent_version_id
  storage_type      snapshot | delta
  content_snapshot  nullable
  content_delta     nullable
  created_at
  updated_at
```

This would reduce storage while avoiding the fragility of storing only deltas forever. Pure delta chains can make reads slow, make branching and auditing harder, and allow one corrupted delta to affect many later versions.

If the editor evolves further, consider storing TipTap/ProseMirror JSON instead of HTML and computing deltas over the structured document format. That would likely be more robust than HTML text diffs, but it is a larger architectural change.

# Task 2 Reviewer Notes

## Option A: AI-Powered Document Editing

Implemented a constrained AI-assisted document editor rather than a general-purpose chat assistant.

## Backend AI Editing Flow

- Added `POST /ai/edit`.
- Added `server/app/ai_editor.py` for AI prompt construction, document block extraction, structured model response handling, operation validation, HTML snippet sanitization, grounding checks, and operation application.
- Added Pydantic request/response models for uploaded context, edit evidence, edit operations, and edit responses.
- The client sends the selected document/version IDs, current editor HTML, user instruction, and optional uploaded `.txt` context.
- The backend verifies the selected document/version exists before running AI editing.

## Safety And Prompt-Injection Guardrails

- The model is instructed to act only as a patent document editing engine.
- The current document and uploaded files are explicitly treated as untrusted reference material, not instructions.
- Uploaded context is rejected if it contains obvious prompt-injection language such as attempts to ignore previous instructions or expose system prompts.
- The model must return structured JSON edit operations rather than arbitrary prose or arbitrary app commands.
- Non-editing requests, prompt-injection attempts, requests for hidden instructions/secrets, and unrelated questions should be refused.
- Ambiguous requests should return `needs_clarification` rather than guessing.

## Anti-Hallucination Guardrails

- The model must not introduce technical facts, claim limitations, materials, dimensions, examples, legal conclusions, or prior-art details unless they are explicitly present in the user instruction, document text, or uploaded context.
- Every edit operation must include evidence showing whether its basis came from `user_instruction`, `document_text`, or `uploaded_context`.
- The backend validates that evidence quotes are actually present in the claimed source.
- The backend also checks significant generated terms against the combined instruction/document/context source text and rejects edits that introduce unsupported terms.
- This is intentionally strict: if the system is uncertain, it should ask for clarification instead of applying a possibly incorrect patent edit.

## Frontend AI Editing UI

- Added `client/src/AIEditorPanel.tsx`.
- Added a right-side AI editor panel with chat-style user/assistant messages.
- Added drag-and-drop and file-picker upload for `.txt` context files.
- Uploaded context is size-limited on the client and passed to the backend as plain text.
- Chat messages auto-scroll to the latest response and preserve line breaks for readability.
- Client-side upload validation checks `.txt` extension, plain-text MIME type when available, max size, duplicates, empty files, and max file count.
- Backend upload validation independently checks `.txt` filenames, duplicate filenames, empty content, max file count, Pydantic content length, and prompt-injection patterns.
- AI edits update the editor immediately but do not auto-save; the existing `Save` button still persists the selected version.

## Task 2 Tests And Verification

- Added mocked backend tests for grounded edits, clarification responses, unsupported factual additions, disallowed HTML, prompt-injection context rejection, and invalid uploaded context files.
- Verified with:

```bash
docker compose run --rm server uv run python -m unittest discover -s tests
npm run build
npm run lint
```
