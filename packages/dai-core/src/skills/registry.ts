import * as path from 'path';
import * as os   from 'os';
import type { Skill } from './types';
import { loadSkillsFromDir } from './loader';

export class SkillsRegistry {
  private cache: Skill[] | null = null;
  private readonly bundledDir: string;
  private readonly userDir: string;

  constructor(bundledDir: string) {
    this.bundledDir = bundledDir;
    this.userDir    = path.join(os.homedir(), '.dai-desktop', 'skills');
  }

  list(forceRefresh = false): Skill[] {
    if (this.cache && !forceRefresh) return this.cache;
    this.cache = [
      ...loadSkillsFromDir(this.bundledDir, 'bundled'),
      ...loadSkillsFromDir(this.userDir,    'user'),
    ];
    return this.cache;
  }

  find(nameOrTrigger: string): Skill | undefined {
    const q = nameOrTrigger.toLowerCase().replace(/^\//, '');
    return this.list().find((s) => s.name.toLowerCase() === q);
  }

  invalidate(): void {
    this.cache = null;
  }
}
