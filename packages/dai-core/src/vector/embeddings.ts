import { LocalLLM } from '../agent/llm';

// Thin wrapper — keeps VectorStore and FileIndexer decoupled from LocalLLM directly.
// Uses the dedicated embed model if loaded, otherwise falls back to the chat model.
export class EmbeddingPipeline {
  readonly modelName: string;
  private llm: LocalLLM;

  constructor(llm: LocalLLM, modelName = 'nomic-embed-text') {
    this.llm = llm;
    this.modelName = modelName;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return this.llm.embed(texts);
  }
}
