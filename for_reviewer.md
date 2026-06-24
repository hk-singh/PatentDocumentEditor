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

# Incremental Hardening Improvements

Added a small production-readiness pass without changing the core architecture.

## Safer Saves And Editing UX

- Added a `revision` field to document versions and return it through document/version APIs.
- The client now sends `base_revision` when saving. If the backend version has changed since the client loaded it, the save returns `409 Conflict` instead of silently overwriting another tab/device's changes.
- Saving an existing version increments its revision. Creating a new version starts at revision 1.
- The frontend tracks saved vs dirty content, shows save status, and warns before switching documents/versions or closing the tab with unsaved edits.

## HTML Safety

- Added server-side HTML sanitization for normal version creation and save endpoints.
- The sanitizer preserves ordinary editor markup while stripping unsafe tags/attributes such as scripts and inline event handlers.

## AI Review And Cost Controls

- AI edits now create a pending proposal in the UI instead of immediately replacing the editor content. Users can apply or discard the proposal, and applying it marks the document as unsaved until the version is saved.
- Added approximate input-token estimation before model calls and a configurable server-side request budget via `AI_MAX_ESTIMATED_INPUT_TOKENS`.
- Added a configurable output cap via `AI_MAX_COMPLETION_TOKENS`.
- AI responses now include usage metadata when available, plus estimated input tokens, model name, and latency.
- Aligned the Python fallback model with `.env.example` by using `gpt-5.2-2025-12-11` unless `OPENAI_MODEL` is set.

Verified with:

```bash
docker compose run --rm server uv run python -m unittest discover -s tests
npm run build
npm run lint
```

# Current Limitations And Improvement Opportunities

This version is a solid challenge implementation, but it still has several limitations that should be addressed before treating it as a production patent drafting tool.

## Persistence And Data Model

- The backend currently uses an in-memory SQLite database, so data is reset when the process restarts. Production needs durable storage, migrations, backups, and environment-specific configuration.
- Each version stores a full HTML string. This is easy to reason about, but it is storage-heavy and makes precise diffs, review comments, semantic search, and collaborative editing harder than a structured document model would.
- Version metadata is minimal. There are no user-facing labels, author IDs, descriptions, branch relationships, review status, or immutable audit entries explaining why a version was created.

## Saving, Concurrency, And Multi-Device Use

- Saves are still full-document payloads, but now include a `base_revision` check to avoid silent stale overwrites. Production should move toward operation-level saves or collaborative deltas for better merge behavior.
- The app now tracks basic dirty/save/conflict state and warns before discarding unsaved edits, but it still does not support autosave, offline edit queues, or local recovery after browser crashes.
- There is no real-time collaboration, cursor presence, or conflict resolution. Multiple users can load the same document, but edits do not sync live and conflicts are not merged.

## Editor And Document Semantics

- The client uses TipTap, but the backend stores and manipulates HTML rather than ProseMirror/TipTap JSON. That limits the ability to make schema-aware transformations, validate patent sections, and compute reliable deltas.
- AI edit block detection is intentionally simple and based on matching HTML block tags. More complex nested content, tables, figures, claim numbering, annotations, or malformed HTML would need a proper document parser.
- The current UI has basic document/version controls, but production workflows would need richer navigation, version compare, comments, tracked changes, claim dependency views, export/import, and review status.

## AI Editing Boundaries

- AI edits are now reviewed as pending proposals before being applied to the editor, but there is not yet a visual document diff showing exactly what changed.
- The grounding checks are intentionally strict and token-based. They reduce unsupported factual additions, but they can reject legitimate rewrites, miss nuanced legal issues, or fail on terminology variants.
- Uploaded context is limited to small `.txt` files and is not stored as a reusable project reference. Production should support larger prior-art documents, citations, source traceability, and asynchronous processing.
- AI requests run synchronously. Larger documents or files should use background jobs with progress, cancellation, retries, rate limits, and audit records.

## OpenAI API Cost And Context Management

- OpenAI API calls are currently user-triggered only: the app calls `POST /ai/edit` when the user clicks `Apply AI Edit`. It does not call the model while the user types in the document, while typing in the AI panel, while switching versions, or while saving a document.
- Each AI request sends the current document HTML, the user instruction, and all attached context files. That is simple and gives the model full context, but it means repeated AI edits on the same document repeatedly resend much of the same input.
- Current limits are character limits, not token-budget limits: document content is capped at 200,000 characters, the instruction at 4,000 characters, and uploaded context at up to 4 files of 20,000 characters each. The client also enforces the 4-file and 20 KB-per-file context limits before upload.
- The backend now estimates input tokens before calling OpenAI and applies configurable input/output token ceilings, but the estimate is approximate rather than tokenizer-accurate.
- The backend returns model usage metadata when available, but it does not yet persist usage/cost records per document, user, organization, or request.
- The current prompt sends every extracted document block to the model. A production version should retrieve only relevant sections when possible, summarize or index long prior-art context, reuse static prompt prefixes, and avoid sending unchanged context repeatedly.
- Recommended production controls include organization-level budgets, per-user rate limits, per-document AI edit limits, request debouncing, explicit confirmation for large/expensive requests, cheaper model tiers for simple formatting edits, and hard server-side request size/token ceilings.

## Security, Compliance, And Operations

- Authentication, authorization, tenant isolation, document permissions, and access audit logs are not implemented.
- CORS is currently permissive for development. Production should restrict origins, tighten request validation, and add rate limiting.
- The save endpoints now sanitize HTML server-side, but the sanitizer is still a simple allow-list rather than a full document-schema validator.
- Observability is limited. Production needs structured logs, metrics, tracing, error reporting, and alerts around save failures, AI failures, latency, and collaboration sync health.

## Test Coverage

- Backend unit tests cover the core versioning and AI guardrail behavior, but there are no end-to-end tests for real browser editing flows.
- Frontend behavior such as version switching, upload validation, unsaved changes, AI edit application, and error states should have component or end-to-end coverage.
- Future collaboration work should be tested with two browser sessions, reconnect behavior, stale saves, and same-user multi-tab editing.

# Future Production Roadmap

The current implementation is intentionally scoped for the challenge: it uses simple version snapshots, request/response saves, and local editor state. The next production phase should separate durable document history from real-time editing state so the system can support large documents, many versions, multiple open browser tabs, and multiple devices per user.

## Storage And Database Direction

- Move from the current development database setup to PostgreSQL as the primary transactional store. It fits the existing SQLAlchemy model, gives strong consistency for document/version metadata, supports row-level locking and transactions, and can store structured editor JSON in `JSONB` when the editor moves from HTML snapshots to ProseMirror/TipTap documents.
- Keep large immutable document artifacts, imported references, generated exports, and periodic checkpoint snapshots in object storage such as S3 instead of forcing every large blob into database rows.
- Use a search index, for example OpenSearch or Elasticsearch, for full-text patent and prior-art search rather than making the primary database handle search-heavy workloads.
- Consider a document database only for specific workloads where flexible nested metadata dominates the access pattern. For this editor, PostgreSQL plus `JSONB`, object storage, and a dedicated search index is likely a simpler and more reliable production baseline than using a NoSQL database as the source of truth.

## Delta Uploads And Version History

- Replace full-document save payloads with editor operation deltas once the document format is TipTap/ProseMirror JSON. The client can upload only the operations since the last acknowledged server revision, reducing bandwidth and making frequent autosave practical.
- Store each accepted change with a monotonic server revision, author/session metadata, timestamps, and the base revision the client edited from. This gives the backend enough information to reject stale writes, transform them, or merge them through the collaboration layer.
- Keep periodic full checkpoints so reads do not require replaying an unbounded delta chain. A production service can compact older deltas into snapshots while preserving the audit log required for patent review workflows.
- Treat AI edits as first-class operations in the same history stream, including model metadata, user instruction, uploaded-context references, validation outcome, and before/after affected ranges for reviewability.

## Real-Time Collaboration

- Add a WebSocket collaboration service backed by a proven ProseMirror collaboration approach, such as Yjs or TipTap collaboration. This avoids hand-rolling conflict resolution for concurrent rich-text edits.
- Use the collaboration layer for live operations and presence, while the backend periodically persists acknowledged document states and operation logs to durable storage.
- Add presence data for active users, cursors, selections, and focused claim/section. Presence should be ephemeral, with Redis or a similar low-latency store acting as the coordination layer rather than the durable source of truth.
- Support multiple tabs and devices for the same user by assigning each connection a stable session ID and device/client ID. That allows the UI to distinguish another user's edit from the same user's second screen and prevents one device from accidentally overwriting another device's unsaved state.

## Conflict, Offline, And Multi-Device Behavior

- Introduce optimistic concurrency for non-collaborative saves by requiring `base_revision` in every save request. If the server has moved ahead, return a conflict response with the latest revision and let the client rebase or ask the user to choose.
- For live collaboration, rely on CRDT/OT semantics so simultaneous edits to the same paragraph or claim are merged deterministically and broadcast back to every connected client.
- Add autosave states such as `saving`, `saved`, `offline`, and `conflict` so users understand whether edits from one screen have reached other devices.
- Queue edits locally when a device is temporarily offline, then replay them against the latest server revision when connectivity returns. Patent edits are high-value work, so silent data loss is worse than a visible conflict.

## Production Hardening

- Add authentication, authorization, document-level permissions, and audit trails before exposing collaboration or AI editing in production.
- Run AI editing asynchronously for larger documents and uploads, with cancellation, retry boundaries, request tracing, and cost/token limits per organization.
- Add migration tooling, database indexes, rate limits, structured logs, metrics, and error tracking around document load/save, AI edit validation, and collaboration sync latency.
- Expand end-to-end tests to cover two browsers editing the same document, the same user editing from two tabs, reconnect behavior, stale saves, AI edits applied during concurrent human edits, and snapshot/delta reconstruction.
