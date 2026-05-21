import * as vscode from 'vscode';
import { SddEngine, SddStore } from '@dai-desktop/core';
import { openPlannerPanel } from './plannerPanel';

let engine: SddEngine | undefined;

export function activate(context: vscode.ExtensionContext): void {
  // Initialise the local SDD engine (SQLite at ~/.dai-desktop/sdd.db)
  const store = new SddStore();
  engine = new SddEngine(store);

  // ── Commands ───────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('dai.openPlanner', () => {
      openPlannerPanel(context, engine!);
    }),

    vscode.commands.registerCommand('dai.newInitiative', async () => {
      // Open planner panel first, then trigger the new-initiative flow
      openPlannerPanel(context, engine!);
    }),
  );

  // Auto-open planner on startup if user has initiatives
  const initiatives = store.listInitiatives();
  if (initiatives.length > 0) {
    openPlannerPanel(context, engine);
  }
}

export function deactivate(): void {
  // nothing to tear down — SQLite closes when the process exits
}
