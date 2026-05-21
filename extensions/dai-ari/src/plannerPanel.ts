import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SddEngine } from '@dai-desktop/core';
import type { SddColumn, Initiative } from '@dai-desktop/core';

// Singleton panel — only one planner open at a time
let currentPanel: vscode.WebviewPanel | undefined;

export function openPlannerPanel(context: vscode.ExtensionContext, engine: SddEngine): void {
  if (currentPanel) {
    currentPanel.reveal();
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'dai.planner',
    'SDD Planner',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(context.extensionPath, '..', '..', 'packages', 'planner-panel', 'dist')),
      ],
    },
  );

  currentPanel = panel;
  panel.onDidDispose(() => { currentPanel = undefined; }, null, context.subscriptions);

  panel.webview.html = getPlannerHtml(panel.webview, context);

  // ── IPC message handler ────────────────────────────────────────────────────
  panel.webview.onDidReceiveMessage(async (msg: { type: string; payload?: unknown }) => {
    switch (msg.type) {

      case 'sdd:list-initiatives': {
        const initiatives = engine.store.listInitiatives();
        panel.webview.postMessage({ type: 'sdd:initiatives', payload: initiatives });
        break;
      }

      case 'sdd:get-board': {
        const { initiativeId } = msg.payload as { initiativeId: string };
        const board = engine.getBoardView(initiativeId);
        panel.webview.postMessage({ type: 'sdd:board', payload: board });
        break;
      }

      case 'sdd:new-initiative': {
        // Prompt inline — lightweight quick-pick flow
        const name = await vscode.window.showInputBox({
          title: 'New Initiative',
          prompt: 'Initiative name',
          placeHolder: 'e.g. Auth refactor, Q2 campaign, Research spike',
        });
        if (!name) break;

        const projectType = await vscode.window.showQuickPick(
          ['software', 'content', 'research', 'ops', 'other'],
          { title: 'Project type' },
        ) as Initiative['projectType'] | undefined;
        if (!projectType) break;

        const northStar = await vscode.window.showInputBox({
          title: 'North Star',
          prompt: 'One-sentence outcome (what does success look like?)',
        }) ?? '';

        const initiative = engine.store.createInitiative({
          name,
          description: '',
          northStar,
          projectType: projectType as Initiative['projectType'],
        });

        // Refresh initiative list and auto-select the new one
        const initiatives = engine.store.listInitiatives();
        panel.webview.postMessage({ type: 'sdd:initiatives', payload: initiatives });
        panel.webview.postMessage({ type: 'sdd:select', payload: { id: initiative.id } });
        break;
      }

      case 'sdd:new-task': {
        const { initiativeId, column } = msg.payload as { initiativeId: string; column: SddColumn };
        const title = await vscode.window.showInputBox({
          title: 'New Task',
          prompt: 'Task title',
        });
        if (!title) break;

        engine.store.createTask({
          initiativeId,
          column,
          title,
          description: '',
          priority: 'medium',
          tags: [],
        });

        const board = engine.getBoardView(initiativeId);
        panel.webview.postMessage({ type: 'sdd:board', payload: board });
        break;
      }

      case 'sdd:move-task': {
        const { taskId, column } = msg.payload as { taskId: string; column: SddColumn };
        const task = engine.store.getTask(taskId);
        if (!task) break;
        engine.moveTask(taskId, column);
        const board = engine.getBoardView(task.initiativeId);
        panel.webview.postMessage({ type: 'sdd:board', payload: board });
        break;
      }

      case 'sdd:start-task': {
        const { taskId } = msg.payload as { taskId: string };
        const task = engine.store.getTask(taskId);
        if (!task) break;
        try {
          engine.startTask(taskId);
        } catch (e: unknown) {
          vscode.window.showWarningMessage((e as Error).message);
        }
        const board = engine.getBoardView(task.initiativeId);
        panel.webview.postMessage({ type: 'sdd:board', payload: board });
        break;
      }

      case 'sdd:pass-validation': {
        const { taskId, evidence } = msg.payload as { taskId: string; evidence: string };
        const task = engine.store.getTask(taskId);
        if (!task) break;
        try {
          engine.passValidation(taskId, evidence);
        } catch (e: unknown) {
          vscode.window.showWarningMessage((e as Error).message);
        }
        const board = engine.getBoardView(task.initiativeId);
        panel.webview.postMessage({ type: 'sdd:board', payload: board });
        break;
      }

      case 'sdd:fail-validation': {
        const { taskId, evidence } = msg.payload as { taskId: string; evidence: string };
        const task = engine.store.getTask(taskId);
        if (!task) break;
        engine.failValidation(taskId, evidence);
        const board = engine.getBoardView(task.initiativeId);
        panel.webview.postMessage({ type: 'sdd:board', payload: board });
        break;
      }

      case 'sdd:open-task': {
        // Open a quick-pick detail view — full editor later
        const { taskId } = msg.payload as { taskId: string };
        const task = engine.store.getTask(taskId);
        if (!task) break;
        vscode.window.showInformationMessage(
          `[${task.column.toUpperCase()}] ${task.title}`,
          'Edit description',
        ).then(async (choice) => {
          if (choice !== 'Edit description') return;
          const desc = await vscode.window.showInputBox({
            title: 'Task description',
            value: task.description,
            prompt: 'Markdown supported',
          });
          if (desc === undefined) return;
          engine.store.updateTask(taskId, { description: desc });
          const board = engine.getBoardView(task.initiativeId);
          panel.webview.postMessage({ type: 'sdd:board', payload: board });
        });
        break;
      }
    }
  }, null, context.subscriptions);
}

// ── HTML shell ─────────────────────────────────────────────────────────────────

function getPlannerHtml(webview: vscode.Webview, context: vscode.ExtensionContext): string {
  const distDir = path.join(context.extensionPath, '..', '..', 'packages', 'planner-panel', 'dist');

  // Try to load built assets; fall back to dev placeholder
  const indexPath = path.join(distDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, 'utf8');
    // Rewrite asset src/href to vscode-resource URIs
    const distUri = webview.asWebviewUri(vscode.Uri.file(distDir)).toString();
    html = html.replace(/(src|href)="(\/[^"]+)"/g, `$1="${distUri}$2"`);
    return html;
  }

  // Dev placeholder — shown when planner-panel hasn't been built yet
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SDD Planner</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #08090E;
      color: rgba(248,249,255,0.35);
      font-family: 'Geist', 'Inter', system-ui, sans-serif;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      flex-direction: column;
      gap: 12px;
    }
    .bar {
      width: 120px; height: 1px;
      background: #00E5CC;
      animation: pulse 1.8s ease-in-out infinite;
    }
    @keyframes pulse {
      0%,100% { transform: scaleX(0.3); opacity: 0.4; }
      50%      { transform: scaleX(1);   opacity: 1;   }
    }
  </style>
</head>
<body>
  <div class="bar"></div>
  <span>Building planner panel — run <code>npm run build --workspace=packages/planner-panel</code></span>
</body>
</html>`;
}

