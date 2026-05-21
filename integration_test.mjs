/**
 * Full IPC round-trip integration test — no WebView, no VS Code.
 * Exercises SddStore + SddEngine end-to-end: gate enforcement, lifecycle transitions,
 * board stats, and the IPC message dispatch table from plannerPanel.ts.
 *
 * Run with: node --experimental-sqlite integration_test.mjs
 */

import { SddStore }  from './packages/dai-core/dist/sdd/store.js';
import { SddEngine } from './packages/dai-core/dist/sdd/engine.js';
import { COLUMN_ORDER } from './packages/dai-core/dist/sdd/types.js';
import * as os   from 'os';
import * as path from 'path';
import * as fs   from 'fs';

// ── Setup ────────────────────────────────────────────────────────────────────

const testDb = path.join(os.tmpdir(), `sdd-itest-${Date.now()}.db`);
const store  = new SddStore(testDb);
const engine = new SddEngine(store);

let passed = 0, failed = 0;

function assert(label, cond, detail = '') {
  if (cond) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

// ── IPC dispatcher (mirrors plannerPanel.ts message handler) ─────────────────

function dispatch(type, payload = {}) {
  switch (type) {
    case 'sdd:list-initiatives': return store.listInitiatives();
    case 'sdd:get-board':        return engine.getBoardView(payload.initiativeId);
    case 'sdd:new-initiative': {
      return store.createInitiative({
        name: payload.name,
        description: payload.description ?? '',
        northStar: payload.northStar ?? '',
        projectType: payload.projectType ?? 'general',
      });
    }
    case 'sdd:new-task': {
      const task = store.createTask({
        initiativeId: payload.initiativeId,
        column: payload.column ?? 'epics',
        title: payload.title,
        description: payload.description ?? '',
        priority: payload.priority ?? 'medium',
        tags: payload.tags ?? [],
      });
      return engine.getBoardView(payload.initiativeId);
    }
    case 'sdd:move-task':        return engine.moveTask(payload.taskId, payload.column);
    case 'sdd:start-task':       return engine.startTask(payload.taskId);
    case 'sdd:send-to-validation': return engine.sendToValidation(payload.taskId, payload.criteria);
    case 'sdd:pass-validation':  return engine.passValidation(payload.taskId, payload.evidence);
    case 'sdd:fail-validation':  return engine.failValidation(payload.taskId, payload.reason);
    default: return { error: `Unknown message: ${type}` };
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────

console.log('\n=== dai-desktop IPC Integration Test ===\n');

// 1. Initiative creation
console.log('1. Initiative lifecycle');
const list0 = dispatch('sdd:list-initiatives');
assert('empty list on fresh db', list0.length === 0);

const init = dispatch('sdd:new-initiative', {
  name: 'Test Initiative',
  description: 'Integration test initiative',
  northStar: 'Validate the full SDD gate chain',
  projectType: 'general',
});
assert('initiative created with id', typeof init.id === 'string');

const list1 = dispatch('sdd:list-initiatives');
assert('initiative appears in list', list1.length === 1);
assert('initiative has correct name', list1[0].name === 'Test Initiative');

// 2. Board view structure
console.log('\n2. Board view');
const board0 = dispatch('sdd:get-board', { initiativeId: init.id });
assert('board has correct initiative', board0.initiative.id === init.id);
assert('board has 5 columns', board0.columns.length === 5);
assert('column order matches COLUMN_ORDER', board0.columns.map(c => c.id).join(',') === COLUMN_ORDER.join(','));
assert('stats total=0', board0.stats.total === 0);
assert('stats done=0', board0.stats.done === 0);

// 3. Task creation in Epics
console.log('\n3. Task creation');
const board1 = dispatch('sdd:new-task', {
  initiativeId: init.id,
  title: 'Feature A',
  column: 'epics',
  priority: 'high',
});
assert('task appears in epics column', board1.columns.find(c => c.id === 'epics')?.count === 1);
assert('stats.total=1', board1.stats.total === 1);

const taskId = board1.columns.find(c => c.id === 'epics').tasks[0].id;

// 4. Start task → Execution
console.log('\n4. Task transitions');
const r1 = dispatch('sdd:start-task', { taskId });
assert('start-task ok', r1.ok === true, JSON.stringify(r1));

const board2 = dispatch('sdd:get-board', { initiativeId: init.id });
assert('task moved to execution', board2.columns.find(c => c.id === 'execution')?.count === 1);
assert('epics now empty', board2.columns.find(c => c.id === 'epics')?.count === 0);

// 5. Can't start again
const r2 = dispatch('sdd:start-task', { taskId });
assert('double-start blocked', r2.ok === false, r2.error);

// 6. Send to Validation
const r3 = dispatch('sdd:send-to-validation', {
  taskId,
  criteria: 'All unit tests pass, code reviewed',
});
assert('sent to validation', r3.ok === true, JSON.stringify(r3));
const board3 = dispatch('sdd:get-board', { initiativeId: init.id });
assert('task in validation', board3.columns.find(c => c.id === 'validation')?.count === 1);
assert('stats.inValidation=1', board3.stats.inValidation === 1);

// 7. Gate: can't move directly to done
console.log('\n5. Gate enforcement');
const r4 = dispatch('sdd:move-task', { taskId, column: 'done' });
assert('direct done blocked', r4.ok === false, r4.error);

const board4 = dispatch('sdd:get-board', { initiativeId: init.id });
assert('task still in validation', board4.columns.find(c => c.id === 'validation')?.count === 1);

// 8. Fail validation → back to execution
const r5 = dispatch('sdd:fail-validation', { taskId, reason: 'Tests failed on CI' });
assert('fail-validation ok', r5.ok === true, JSON.stringify(r5));
const board5 = dispatch('sdd:get-board', { initiativeId: init.id });
assert('failed task back in execution', board5.columns.find(c => c.id === 'execution')?.count === 1);
assert('validation column empty after fail', board5.columns.find(c => c.id === 'validation')?.count === 0);

// 9. Send back to validation and pass
const r6 = dispatch('sdd:send-to-validation', {
  taskId,
  criteria: 'Tests pass on second attempt',
});
assert('re-sent to validation', r6.ok === true);

const r7 = dispatch('sdd:pass-validation', {
  taskId,
  evidence: 'CI green, peer review approved, LGTM',
});
assert('pass-validation ok', r7.ok === true, JSON.stringify(r7));

// 10. Done!
const board6 = dispatch('sdd:get-board', { initiativeId: init.id });
assert('task in done', board6.columns.find(c => c.id === 'done')?.count === 1);
assert('stats.done=1', board6.stats.done === 1);
assert('100% complete', board6.stats.percentComplete === 100);
assert('validation empty', board6.columns.find(c => c.id === 'validation')?.count === 0);

// 11. Bulk task creation + status report
console.log('\n6. Bulk tasks + status report');
const board7 = dispatch('sdd:new-task', { initiativeId: init.id, title: 'Task B', column: 'epics', priority: 'medium' });
const board8 = dispatch('sdd:new-task', { initiativeId: init.id, title: 'Task C', column: 'north-stars', priority: 'low' });
const finalBoard = dispatch('sdd:get-board', { initiativeId: init.id });
assert('total=3 after bulk', finalBoard.stats.total === 3);
assert('done still 1 (33%)', finalBoard.stats.done === 1);
assert('percentComplete=33', finalBoard.stats.percentComplete === 33);

const report = engine.statusReport(init.id);
assert('status report contains initiative name', report.includes('Test Initiative'));
assert('status report shows progress', report.includes('1/3'));
assert('status report has Done column', report.includes('Done'));

// 12. Comments persist
console.log('\n7. Comment trail');
const comments = store.listComments(taskId);
assert('has ≥4 lifecycle comments', comments.length >= 4, `got ${comments.length}`);
assert('has pass comment', comments.some(c => c.body.includes('PASSED')));
assert('has fail comment', comments.some(c => c.body.includes('FAILED')));

// ── Cleanup ──────────────────────────────────────────────────────────────────

store.close();
try { fs.unlinkSync(testDb); } catch {}

const total = passed + failed;
console.log(`\n${'─'.repeat(45)}`);
if (failed === 0) {
  console.log(`INTEGRATION TEST PASSED — ${passed}/${total} assertions`);
} else {
  console.log(`INTEGRATION TEST FAILED — ${failed} failures out of ${total}`);
  process.exit(1);
}
