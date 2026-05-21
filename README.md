# dai-desktop

> Local-first AI workspace — code, content, research, artifacts. Ari built in. Zero required cloud.

Built on [Code-OSS](https://github.com/microsoft/vscode) (VS Code open source, MIT) with Ari (dai-skills) as the core intelligence layer. Think Cursor, but for any workflow — not just code.

## Architecture

```
dai-desktop/
├── packages/
│   ├── dai-core/          # Agent loop, LanceDB vector store, process manager
│   │   └── src/
│   │       ├── agent/     # AgentLoop, ToolRegistry, ModelRouter
│   │       ├── vector/    # VectorStore, FileIndexer, EmbeddingPipeline
│   │       └── process/   # ProcessManager, OllamaManager, McpRegistry
│   ├── ari-panel/         # React WebView: chat UI, streaming, tool-use cards
│   ├── artifact-panel/    # Tiptap document editor WebView
│   └── process-manager/   # Process health dashboard WebView
├── extensions/
│   └── dai-ari/           # VS Code extension bridging panels → dai-core
├── assets/                # Icons, splash screens
└── CLAUDE.md              # Architecture decisions, SDD spec IDs
```

## Stack

| Layer | Choice | Rationale |
|---|---|---|
| Shell | Code-OSS fork + Electron | Editor, terminal, file tree for free |
| Vector DB | LanceDB (embedded TS) | 4MB idle, <10ms queries, Apache 2.0 |
| AI | Ari via dai-skills MCP | Full tool-use agent, multi-model |
| Chunking | tree-sitter + paragraph | AST-accurate code chunks |
| Process mgmt | Custom ProcessManager | Restart-on-crash, health metrics |
| Local models | Ollama | nomic-embed-text + llama3.2 |

## Quick Start

```bash
# Prerequisites
# 1. Install Ollama: https://ollama.ai
# 2. Pull models
ollama pull nomic-embed-text
ollama pull llama3.2:3b

# Install and build
npm install
npm run build:core

# Dev mode (Code-OSS fork required — see docs/fork-setup.md)
npm run dev
```

## SDD Spec

This repo is governed by the **all-dai-sdd** protocol. Every task is spec'd, gated, and validated before shipping.

- **Datasphere:** https://dataspheres.ai/app/dai-desktop
- **Board:** https://dataspheres.ai/app/dai-desktop/planner  
- **Dashboard:** https://dataspheres.ai/pages/dai-desktop/dai-desktop-dashboard

### Validation Gates

| Gate | Description | Status |
|---|---|---|
| VA-001 | Editor baseline — VS Code parity | ⏳ Pending |
| VA-002 | Ari agent quality — 8/10 HumanEval tasks | ⏳ Pending |
| VA-003 | Vector search Recall@3 ≥ 0.80 | ⏳ Pending |
| VA-004 | Workflow E2E — blog + diagram + tasks in <3min | ⏳ Pending |
| VA-005 | Local model parity — offline mode | ⏳ Pending |
| VA-006 | Process manager — Ollama + MCP lifecycle | ⏳ Pending |

## License

MIT for all dai-desktop original code. Code-OSS base retains its MIT license.
Ari/dai-skills: see [dai-skills license](https://github.com/geekdreamzz/ari-dai-skills).
