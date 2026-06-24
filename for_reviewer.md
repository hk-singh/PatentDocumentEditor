# Reviewer Notes

This implementation completes Task 1 document versioning and Task 2 Option A,
AI-powered document editing. It also includes a small hardening pass around
stale saves, HTML safety, AI review, and request-size controls.

## How To Run

Create the server environment file:

```bash
cp server/.env.example server/.env
```

Set `OPENAI_API_KEY` in `server/.env`, then start the full app:

```bash
docker compose up --build
```

Open the UI at `http://localhost:5173`. The API runs at
`http://localhost:8000`.

## Verification Commands

Backend tests:

```bash
docker compose run --rm server uv run python -m unittest discover -s tests
```

Client checks:

```bash
cd client
npm run lint
npm run build
```

Current verification status: backend tests pass with 14 tests, client lint
passes, and the client production build passes.

## Task 1: Document Versioning

### Backend

- Added `DocumentVersion` as a first-class SQLAlchemy model linked to
  `Document`.
- Each document has ordered versions with a unique
  `(document_id, version_number)` pair.
- Seed data creates version 1 for both sample patents.
- Added a `revision` field to support stale-save conflict detection.

### API

- `GET /document/{document_id}` returns document content, selected version
  metadata, and all available versions. It defaults to the latest version and
  accepts an optional `version_id` query parameter.
- `GET /document/{document_id}/versions` lists versions for a document.
- `GET /document/{document_id}/versions/{version_id}` loads one version.
- `POST /document/{document_id}/versions` creates a new version from submitted
  content, a source version, or the latest version.
- `PUT /document/{document_id}/versions/{version_id}` saves edits to an
  existing version without creating another version.
- `POST /save/{document_id}` remains as a compatibility route that saves the
  latest version.

### Client

- Added document/version metadata state and selected-version tracking.
- Added a version selector beside the patent title.
- Added `Create Version`, which creates a new version from current editor
  content and selects it.
- Updated `Save` to persist only the currently selected version.
- Added dirty, saving, saved, error, and conflict UI states.
- Added warnings before switching documents/versions or closing the page with
  unsaved edits.

## Task 2: AI-Powered Document Editing

The AI editor is intentionally constrained. It behaves as a patent document edit
engine, not a general-purpose assistant.

### Backend Flow

- Added `POST /ai/edit`.
- Added `server/app/ai_editor.py` for prompt construction, document block
  extraction, structured response handling, operation validation, grounding
  checks, and operation application.
- Added Pydantic models for uploaded context, evidence, edit operations,
  responses, and usage metadata.
- The client sends the selected document ID, version ID, current editor HTML,
  user instruction, and optional uploaded `.txt` context.
- The backend verifies the selected document/version exists before attempting an
  AI edit.

### Guardrails

- The model must return structured JSON edit operations.
- The current document and uploaded files are treated as untrusted reference
  material, not instructions.
- Obvious prompt-injection language in uploaded context is rejected.
- Non-editing requests, prompt-injection attempts, and requests for hidden
  instructions or secrets should be refused.
- Ambiguous requests should return `needs_clarification` instead of guessing.
- AI edits must not introduce technical facts, claim limitations, materials,
  dimensions, examples, legal conclusions, or prior-art details unless grounded
  in the user instruction, document text, or uploaded context.
- Each operation includes evidence quotes, and the backend checks that those
  quotes exist in the claimed source.
- Generated snippets are sanitized and limited to ordinary editor tags.

### Client Flow

- Added `client/src/AIEditorPanel.tsx`.
- Added chat-style AI instruction UI.
- Added drag-and-drop and file-picker upload for `.txt` context files.
- Client-side validation checks file extension, MIME type when available, size,
  duplicate filenames, empty files, and file count.
- AI responses become pending proposals. Users can apply or discard the proposal
  before changing the editor.
- Applying an AI proposal updates the editor but does not auto-save; the normal
  `Save` button persists the selected version.

## Hardening Improvements

- Added `base_revision` to save requests so stale saves return `409 Conflict`
  instead of silently overwriting newer content.
- Added server-side HTML sanitization for version creation and save endpoints.
- Added configurable AI request controls:
  - `AI_MAX_ESTIMATED_INPUT_TOKENS`
  - `AI_MAX_COMPLETION_TOKENS`
  - `OPENAI_MODEL`
- AI responses include usage metadata when available, estimated input tokens,
  model name, and latency.

## Current Limitations

- The backend uses in-memory SQLite, so data resets on restart.
- Authentication, authorization, tenant isolation, permissions, and audit logs
  are not implemented.
- Versions store full HTML snapshots. This is simple and reliable for the
  challenge, but production should consider structured TipTap/ProseMirror JSON,
  deltas, and checkpoint snapshots.
- There is no visual diff for pending AI proposals.
- There is no real-time collaboration, cursor presence, autosave queue, offline
  recovery, or merge UI.
- AI requests are synchronous and send the current document plus all uploaded
  context on each request.
- Frontend behavior has not been covered by browser end-to-end tests.

## Production Roadmap

- Move persistence to PostgreSQL with migrations, durable backups, and
  environment-specific configuration.
- Store structured editor JSON and operation history rather than only HTML
  snapshots.
- Use object storage for large immutable artifacts, imports, exports, and
  checkpoint snapshots.
- Add search infrastructure for full-text patent and prior-art search.
- Add autosave, operation-level deltas, version compare, tracked changes,
  comments, claim dependency views, and export/import workflows.
- Add real-time collaboration with a proven ProseMirror approach such as Yjs or
  TipTap collaboration.
- Add organization/user budgets, rate limits, audit records, async AI jobs,
  retries, cancellation, and persisted usage/cost tracking.
- Add structured logs, metrics, tracing, error reporting, and end-to-end tests
  for document editing, version switching, AI proposals, and multi-tab conflict
  behavior.
