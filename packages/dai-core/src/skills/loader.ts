import * as fs from 'fs';
import * as path from 'path';
import type { Skill, SkillMeta, SkillSource } from './types';

// SKILL.md files sometimes start with an HTML comment (e.g. <!-- dai-sync: skip -->)
// followed by the YAML frontmatter. Strip comments before parsing.
const HTML_COMMENT = /^<!--[\s\S]*?-->\s*/;
const FRONTMATTER   = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function parseFrontmatter(raw: string): { meta: Partial<SkillMeta>; body: string } {
  const cleaned = raw.replace(HTML_COMMENT, '');
  const match   = FRONTMATTER.exec(cleaned);
  if (!match) return { meta: {}, body: cleaned };

  const yamlStr = match[1];
  const body    = cleaned.slice(match[0].length).trim();
  const meta: Record<string, unknown> = {};

  for (const line of yamlStr.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) continue;
    const key    = line.slice(0, colonIdx).trim();
    const valRaw = line.slice(colonIdx + 1).trim();
    if (!valRaw) continue;

    if (valRaw.startsWith('[') && valRaw.endsWith(']')) {
      meta[key] = valRaw
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    } else {
      meta[key] = valRaw.replace(/^['"]|['"]$/g, '');
    }
  }

  return { meta: meta as Partial<SkillMeta>, body };
}

export function loadSkillFile(filePath: string, source: SkillSource): Skill | null {
  try {
    const raw          = fs.readFileSync(filePath, 'utf-8');
    const { meta, body } = parseFrontmatter(raw);
    if (!meta.name) return null;

    const name = meta.name as string;
    return {
      id:          `${source}:${name}`,
      name,
      description: (meta.description as string | undefined) ?? '',
      version:     (meta.version    as string | undefined) ?? '1.0.0',
      argumentHint:(meta as Record<string, unknown>)['argument-hint'] as string | undefined,
      tags:        Array.isArray(meta.tags) ? (meta.tags as string[]) : [],
      source,
      filePath,
      content:     raw,
      systemPrompt: body,
    };
  } catch {
    return null;
  }
}

export function loadSkillsFromDir(dir: string, source: SkillSource): Skill[] {
  if (!fs.existsSync(dir)) return [];

  const skills: Skill[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(dir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;
      const skill = loadSkillFile(skillFile, source);
      if (skill) skills.push(skill);
    }
  } catch {
    // swallow unreadable directory
  }
  return skills;
}
