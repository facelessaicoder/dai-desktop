export type SkillSource = 'bundled' | 'user' | 'community';

export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  version: string;
  argumentHint?: string;
  tags?: string[];
  source: SkillSource;
  filePath: string;
}

export interface Skill extends SkillMeta {
  content: string;
  systemPrompt: string;
}
