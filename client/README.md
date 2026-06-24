# Patent Reviewer UI

React and Vite client for editing patent documents, switching document versions,
saving changes, and reviewing AI edit proposals.

## Layout

Application code is in `src/`.

```text
src
├── AIEditorPanel.tsx  # AI instruction chat, .txt context upload, proposals
├── App.tsx            # App shell, document/version state, save flow
├── Document.tsx       # Document editor wrapper
├── Editor.tsx         # TipTap editor component
├── LoadingOverlay.tsx # Loading overlay component
└── main.tsx           # React entrypoint
```

## Running With Docker

From the repository root:

```bash
docker compose up --build
```

The UI will be available at `http://localhost:5173`.

## Running Locally Without Docker

```bash
npm install
npm run dev
```

When running locally outside Docker, the Vite dev server proxies API requests to
the backend target configured in `client/vite.config.ts`.

## Checks

```bash
npm run lint
npm run build
```
