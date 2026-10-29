// An app's routines, for every agent: its skills (.claude/skills/<name>/SKILL.md), its helpers' instructions
// (.claude/agents/<name>.md), and the rules that always hold (one section of its AGENTS.md). Claude Code loads the
// skills itself; any other agent reads them through the MCP tool `method` or the MCP prompts, and the app's own agent
// on a model API through the same tool, in process. One copy of the method, whoever runs.
//
//   const method = createMethod({ root, section: 'When keeping his record', otherAgents, prompts: ['journal'], … });
//   createMcpHandler(app, { …, extend: (mcp, { client }) => client !== 'claude-code' && method.register(mcp, …) });
//
// From Aristotle's and Galen's server/method.ts and the `method` and prompts of their mcp.ts, which were the same
// but for the section's name, the words for another agent and the tool's texts: those are the app's here.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { READ_ONLY, text } from './mcp.ts';

export interface Skill {
  name: string;
  /** What it is for and when to use it (its front matter's description). */
  description: string;
  /** The instructions themselves, without the front matter. */
  body: string;
  kind: 'skill' | 'helper';
}

export interface MethodOptions {
  /** The app's checkout: .claude/skills, .claude/agents and AGENTS.md are read from it. */
  root: string;
  /** The heading of the AGENTS.md section whose rules hold whichever skill runs ("When keeping his record"). */
  section: string;
  /** Said before a skill to an agent that isn't Claude Code: what Claude Code's names stand for. */
  otherAgents: string;
  /** The skills offered as MCP prompts (slash commands in clients that have them). */
  prompts?: string[];
  /** The `method` tool: its title, description, and what its `name` argument takes. */
  tool: { title: string; description: string; name: string };
  /** The prompts: the app's name before each title, the request argument's description, and how the request is put. */
  prompt?: { title: string; request: string; entry: string; empty: string };
}

export interface Method {
  /** Every skill, then the helpers, read fresh: they are a few kilobytes, and change with a release. */
  skills(): Skill[];
  skill(name: string): Skill | undefined;
  /** The AGENTS.md section: the rules that hold whichever skill is running. */
  essentials(): string;
  /** A skill as an agent that isn't Claude Code is handed it: the words for it, the rules (not in process), the skill. */
  handed(name: string, inProcess: boolean): string | undefined;
  /** Adds `method` and the prompts to one request's server. `inProcess`: the app's own agent, which has the rules already. */
  register(mcp: McpServer, options?: { inProcess?: boolean }): void;
}

export function createMethod(options: MethodOptions): Method {
  const skillsDir = path.join(options.root, '.claude', 'skills');
  const agentsDir = path.join(options.root, '.claude', 'agents');

  function skills(): Skill[] {
    const list: Skill[] = [];
    for (const dir of names(skillsDir)) {
      const s = parse(path.join(skillsDir, dir, 'SKILL.md'), dir, 'skill');
      if (s) list.push(s);
    }
    for (const file of names(agentsDir).filter((f) => f.endsWith('.md'))) {
      const helper = parse(path.join(agentsDir, file), file.slice(0, -3), 'helper');
      if (helper) list.push(helper);
    }
    return list;
  }

  function skill(name: string): Skill | undefined {
    const wanted = name.trim().replace(/^\//, '').toLowerCase();
    return skills().find((s) => s.name === wanted);
  }

  function essentials(): string {
    try {
      const text = readFileSync(path.join(options.root, 'AGENTS.md'), 'utf8');
      const start = text.indexOf(`## ${options.section}`);
      if (start === -1) return '';
      const end = text.indexOf('\n## ', start + 3);
      return text.slice(start, end === -1 ? undefined : end).trim();
    } catch {
      return '';
    }
  }

  function handed(name: string, inProcess: boolean): string | undefined {
    const s = skill(name);
    if (!s) return undefined;
    const rules = s.kind === 'skill' && !inProcess ? essentials() : '';
    return [options.otherAgents, rules, `# ${s.name}\n\n${s.body}`].filter(Boolean).join('\n\n');
  }

  function register(mcp: McpServer, { inProcess = false } = {}) {
    mcp.registerTool(
      'method',
      {
        annotations: READ_ONLY,
        title: options.tool.title,
        description: `${options.tool.description} Without \`name\`, lists the routines.`,
        inputSchema: { name: z.string().optional().describe(options.tool.name) },
      },
      async ({ name }) => {
        const list = skills();
        if (!name) return text(list.map((s) => `- ${s.name} (${s.kind}): ${s.description}`).join('\n') || 'No skills found.');
        return text(handed(name, inProcess) ?? `No skill "${name}". There are: ${list.map((s) => s.name).join(', ')}.`);
      },
    );
    const p = options.prompt;
    if (!p) return;
    for (const name of options.prompts ?? []) {
      const s = skill(name);
      if (!s) continue;
      mcp.registerPrompt(
        name,
        { title: `${p.title}: ${name}`, description: s.description, argsSchema: { request: z.string().optional().describe(p.request) } },
        ({ request }) => ({
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `${handed(name, inProcess)}\n\n---\n\n${request?.trim() ? `${p.entry}: ${request.trim()}` : p.empty}`,
              },
            },
          ],
        }),
      );
    }
  }

  return { skills, skill, essentials, handed, register };
}

function names(dir: string): string[] {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
}

function parse(file: string, fallback: string, kind: Skill['kind']): Skill | undefined {
  let body: string;
  try {
    body = readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(body);
  const fields = Object.fromEntries([...(fm?.[1] ?? '').matchAll(/^(\w+):\s*(.*)$/gm)].map(([, k, v]) => [k, (v ?? '').trim()]));
  return {
    name: (fields.name || fallback).toLowerCase(),
    description: fields.description ?? '',
    body: (fm ? body.slice(fm[0].length) : body).trim(),
    kind,
  };
}
