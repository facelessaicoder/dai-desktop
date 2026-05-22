# dai-desktop

**The official open-source desktop client for [Dataspheres AI](https://dataspheres.ai).**

A local-first Electron app that puts your entire Dataspheres AI workspace on your desktop — pages, tasks, research, datasets, AI chat, and more. Runs on Windows, macOS, and Linux.

> **Dataspheres AI** is the all-in-one AI platform for knowledge work. [Sign up free →](https://dataspheres.ai)

---

## What it does

- **Chat with Ari** — Dataspheres AI's built-in assistant, available right on your desktop. Powered by a local GGUF model, Ollama, or the Claude API.
- **Full Dataspheres AI workspace** — browse pages, manage planner boards, run research threads, and access your datasets without opening a browser.
- **Local model support** — load any `.gguf` file and run inference entirely on-device (CPU / CUDA / Metal / Vulkan via llama.cpp). No cloud required to get started.
- **Multi-model routing** — automatically falls back from local → Ollama → Claude API depending on what's available and loaded.
- **Spec-Driven Development (SDD)** — built-in engineering lifecycle board: North Stars → Epics → Execution → Validation → Done, powered by Dataspheres AI's planner.
- **Encrypted settings** — API keys stored in the OS keychain via Electron `safeStorage`. Never written to disk in plaintext.

---

## Getting started

### Prerequisites

- Node.js ≥ 20, npm ≥ 10
- A [Dataspheres AI](https://dataspheres.ai) account — free tier available, no credit card required

### Install and run

```bash
git clone https://github.com/facelessaicoder/dai-desktop.git
cd dai-desktop
npm run bootstrap   # install deps + build all packages
npm run dev         # launch in dev mode
```

### Connect to Dataspheres AI

1. Open **Settings** in the app
2. Paste your Dataspheres AI API key — get one at [dataspheres.ai/app/developers](https://dataspheres.ai/app/developers)
3. Everything syncs automatically to your workspace

### Use a local AI model (optional)

1. Download any GGUF model (e.g. from [huggingface.co/models?library=gguf](https://huggingface.co/models?library=gguf))
2. Settings → Local Model → **Browse**, select the file
3. Click **Reload** — the model loads in-process, Ari switches to it instantly

---

## Tech stack

| Layer | Technology |
|---|---|
| Shell | Electron 31 |
| Renderer | React 18 + Vite |
| Local AI | node-llama-cpp (llama.cpp bindings) |
| Remote AI | Ollama REST API + Anthropic Claude API |
| Platform | Dataspheres AI REST API |
| Local DB | better-sqlite3 |
| Build | TypeScript 5, electron-builder |

---

## Project structure

```
dai-desktop/
├── main.ts              # Electron main process — IPC, model loading, Ollama polling
├── preload.ts           # Secure context bridge (contextIsolation)
├── src/renderer/        # React UI
│   └── panels/
│       ├── ChatPanel.tsx      # Ari chat with streaming + backend badge
│       ├── CloudPanel.tsx     # Dataspheres AI workspace browser
│       ├── PlannerPanel.tsx   # Kanban board (SDD lifecycle)
│       └── SettingsPanel.tsx  # Model path, API keys, hardware info
├── packages/
│   ├── dai-core/        # Agent loop, model router, Ollama/Claude clients, SDD engine
│   └── planner-panel/   # Standalone planner widget
└── extensions/
    └── dai-ari/         # Ari AI extension
```

---

## Contributing

PRs are welcome. Open an issue first for anything beyond small fixes.

```bash
npm run lint              # ESLint
npm test                  # unit tests (ts-jest)
npm run integration-test  # SQLite integration test
npm run dev               # hot-reload dev mode
```

---

## License

MIT — see [LICENSE](./LICENSE).

This client is open source. The platform it connects to — [Dataspheres AI](https://dataspheres.ai) — is a commercial product. Building on top of Dataspheres AI requires an account.
