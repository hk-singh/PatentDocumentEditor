# Solve Intelligence Patent Document Editor

A patent document review and editing application built for the Solve Intelligence
engineering challenge. The app includes document versioning, a rich text editor,
and a constrained AI editing panel for making patent document edits from natural
language instructions.

## Implemented Features

- Document versioning with create, switch, and save-in-place workflows.
- Revision checks on save to prevent silent stale overwrites from another tab or
  session.
- TipTap-based patent document editing in the React client.
- AI-powered editing through `POST /ai/edit`, backed by structured edit
  operations rather than free-form model output.
- Drag-and-drop `.txt` context upload for AI edits.
- Pending AI proposals with apply/discard review before the editor content is
  changed.
- Server-side HTML sanitization for normal saves and AI-generated snippets.
- Guardrails for prompt injection, unsupported factual additions, unsafe HTML,
  oversized AI requests, and invalid context uploads.
- Backend unit tests for versioning and AI guardrail behavior.

## Run The App

Create the server environment file first:

```bash
cp server/.env.example server/.env
```

Edit `server/.env` and set `OPENAI_API_KEY` to a valid key. The default model is
configured in that file and can be changed with `OPENAI_MODEL`.

Then build and start both services:

```bash
docker compose up --build
```

Open the client at:

```text
http://localhost:5173
```

The FastAPI server is available at:

```text
http://localhost:8000
```

## Verification

Run the backend tests:

```bash
docker compose run --rm server uv run python -m unittest discover -s tests
```

Run the client checks:

```bash
cd client
npm run lint
npm run build
```

The latest verification completed successfully with 14 backend tests, client
lint, and client production build passing.

## Notes For Reviewers

Detailed implementation notes, tradeoffs, limitations, and production follow-up
recommendations are in `for_reviewer.md`.

The development database is in-memory SQLite and is seeded on server startup.
Restarting the backend resets document changes.
