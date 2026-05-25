// Agent
export { AgentLoop }                           from './agent/loop';
export { ToolRegistry }                        from './agent/tools';
export { ModelRouter }                         from './agent/router';
export { LocalLLM }                            from './agent/llm';
export { OllamaClient }                        from './agent/ollama';
export { ClaudeAPIClient }                     from './agent/claude';
export { HardwareDetect }                      from './agent/hardware';
export type { HardwareInfo, AccelerationType } from './agent/hardware';
export type { LLMConfig, ChatMessage }         from './agent/llm';
export type { LocalModelConfig, BackendType }  from './agent/router';
export type { AgentEvent, AgentLoopOptions }   from './agent/loop';

// Vector
export { VectorStore }       from './vector/store';
export { FileIndexer }       from './vector/indexer';
export { EmbeddingPipeline } from './vector/embeddings';

// Process
export { ProcessManager }    from './process/manager';
export { McpRegistry }       from './process/mcp';
export type { McpServerConfig } from './process/mcp';

// SDD — Local Spec-Driven Development engine
export { SddStore }   from './sdd/store';
export { SddEngine }  from './sdd/engine';
export type {
  SddColumn,
  Initiative,
  Task,
  Priority,
  ValidationResult,
  ValidationGate,
  BoardView,
  BoardColumn,
  TaskComment,
} from './sdd/types';
export { COLUMN_ORDER, COLUMN_LABELS } from './sdd/types';

// Skills — SKILL.md loader + registry
export { SkillsRegistry }                    from './skills/registry';
export { loadSkillFile, loadSkillsFromDir }  from './skills/loader';
export type { Skill, SkillMeta, SkillSource } from './skills/types';

// Cloud — Dataspheres API bridge
export { DatasphereClient, DatasphereService, AuthError, NotFoundError, ApiError } from './cloud/service';
export type {
  Datasphere,
  Page,
  Task as DsTask,
  PlanMode,
  StatusGroup,
  Comment as DsComment,
  CreatePageInput,
  CreateTaskInput,
} from './cloud/types';
