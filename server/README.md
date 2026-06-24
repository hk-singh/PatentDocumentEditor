# Patent Reviewer Backend

FastAPI backend for document loading, versioning, saving, and constrained
AI-assisted patent document editing.

## Layout

Application code is in `app/`.

```text
app
├── __main__.py      # FastAPI app, routes, versioning, save endpoints
├── ai_editor.py     # AI prompt construction, validation, and edit application
├── data.py          # Seed patent documents
├── db.py            # SQLAlchemy engine/session helpers
├── html_safety.py   # Server-side HTML sanitizer
├── models.py        # SQLAlchemy models
└── schemas.py       # Pydantic request/response models
```

Tests live in `tests/`.

## Environment

Copy the example env file from the repository root:

```bash
cp server/.env.example server/.env
```

Required:

```text
OPENAI_API_KEY=sk-...
```

Optional:

```text
OPENAI_MODEL=gpt-5.2-2025-12-11
AI_MAX_ESTIMATED_INPUT_TOKENS=50000
AI_MAX_COMPLETION_TOKENS=1200
```

## Running With Docker

From the repository root:

```bash
docker compose up --build
```

The API will be available at `http://localhost:8000`.

## Running Locally Without Docker

This project uses `uv` for Python dependency management and requires Python
3.13 or newer.

```bash
uv sync
uv run uvicorn app.__main__:app --reload
```

## Tests

From the repository root, using the Docker service:

```bash
docker compose run --rm server uv run python -m unittest discover -s tests
```

## Database

The app uses an in-memory SQLite database in this challenge implementation.
Tables and seed documents are initialized on startup, so restarting the backend
resets document edits and created versions.
