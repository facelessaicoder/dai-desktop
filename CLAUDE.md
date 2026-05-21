# dai-desktop

## Project
Local-first AI workspace built on Code-OSS (VS Code open source fork) + Ari (dai-skills).
Works like Cursor/Claude Code but for any workflow: code, content, research, artifacts.
Owner: facelessaicoder. All specs under all-dai-sdd protocol.

## Active Datasphere
dai-desktop (DS_ID: cmpev5pvc0fewo54wjkh90fh4)
- Planner: https://dataspheres.ai/app/dai-desktop/planner
- Dashboard: https://dataspheres.ai/pages/dai-desktop/dai-desktop-dashboard

## Architecture

### Shell
- Base: microsoft/vscode (Code-OSS, MIT) forked at main
- Runtime: Electron (via VS Code's existing Electron Forge pipeline)
- Build targets: macOS (.dmg), Linux (.AppImage), Windows (.exe)
- Registry: Open VSX (open-vsx.org) — NOT Microsoft Marketplace

### AI Layer
- Engine: Ari via dai-skills MCP server (auto-started core process)
- Transport: MCP stdio (local), HTTP (remote servers)
- Models: Anthropic API (Claude) / OpenAI API / Ollama local — multi-model router
- Panel: React WebView in VS Code sidebar, streaming SSE, tool-use cards

### Vector Intelligence
- DB: LanceDB embedded (TypeScript SDK, Apache 2.0, ~4MB idle)
- Chunking: tree-sitter AST (code), paragraph (docs/markdown)
- Embeddings: nomic-embed-text via Ollama (local) or text-embedding-3-small (API)
- Storage: ~/.dai-desktop/vectordb/ (Lance columnar format)
- Queries: <10ms at 1M+ vectors

### Process Manager
- Ollama: auto-detect, start, stop, model pull
- MCP servers: npm registry discovery, install, auto-start, restart-on-crash
- Health: real-time CPU/memory dashboard per process

### Workflow Engine
- Document editor: Tiptap (HTML, embedded in WebView panel)
- Dataspheres sync: dai-skills MCP bidirectional
- Canvas: Mermaid live preview panel
- Research: web search + synthesis → artifact

## Key Decisions
- Code-OSS fork preferred over Electron from scratch (terminal, file tree, extensions are free)
- LanceDB over ChromaDB/Qdrant for local embed (lighter, TS-native, no server)
- Ari as core process not extension (extensions can't own the AI layer reliably)
- Open VSX over MS Marketplace (license-compatible, avoids EULA issues)

## SDD Spec IDs
- NS-001/002/003 — North Stars
- EP-001..006 — Epics (Shell, AI, Vector, Workflow, Process, Plugins)
- EX-SH-001..005 — Shell execution tasks
- EX-AI-001..006 — Ari AI layer tasks
- EX-VEC-001..005 — Vector intelligence tasks
- EX-WF-001..004 — Workflow engine tasks
- EX-PM-001..003 — Process manager tasks
- EX-EX-001..002 — Extension system tasks
- VA-001..006 — Validation gates

## Blocked Dependencies (resolve before first milestone)
- Code-OSS fork: requires git clone of microsoft/vscode + Electron build env
- Ollama: install at https://ollama.ai (no paid license)
- LanceDB Node.js: `npm install @lancedb/lancedb`
- tree-sitter Node.js: `npm install tree-sitter tree-sitter-typescript tree-sitter-python`
- nomic-embed-text: `ollama pull nomic-embed-text`

## Repo Structure
See directory layout below — mirrors Code-OSS conventions where possible.
