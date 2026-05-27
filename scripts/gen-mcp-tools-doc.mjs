#!/usr/bin/env node
/**
 * Regenerates docs/reference/mcp-tools.md from packages/mcp-server/src/tools/*.ts.
 * Run with: node scripts/gen-mcp-tools-doc.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const TOOLS_DIR = join(REPO_ROOT, 'packages/mcp-server/src/tools');
const OUT_PATH = join(REPO_ROOT, 'docs/reference/mcp-tools.md');

const FILE_TO_SECTION = {
  'feature-tools.ts': 'Feature Management',
  'agent-tools.ts': 'Agent Control',
  'queue-tools.ts': 'Queue Management',
  'context-tools.ts': 'Context & Skills',
  'orchestration-tools.ts': 'Orchestration',
  'project-tools.ts': 'Project Orchestration',
  'git-tools.ts': 'GitHub Operations',
  'git-ops-tools.ts': 'Git Operations',
  'lead-engineer-tools.ts': 'Lead Engineer',
  'knowledge-tools.ts': 'Knowledge',
  'observability-tools.ts': 'Observability',
  'portfolio-tools.ts': 'Portfolio',
  'setup-tools.ts': 'SetupLab',
  'utility-tools.ts': 'Utilities',
  'integration-tools.ts': 'Integrations',
  'scheduler-tools.ts': 'Scheduler',
  'qa-tools.ts': 'QA',
  'cross-repo-tools.ts': 'Cross-Repo',
  'workspace-tools.ts': 'Notes & Workspace',
};

const SECTION_ORDER = [
  'feature-tools.ts',
  'agent-tools.ts',
  'queue-tools.ts',
  'context-tools.ts',
  'orchestration-tools.ts',
  'project-tools.ts',
  'git-tools.ts',
  'git-ops-tools.ts',
  'lead-engineer-tools.ts',
  'workspace-tools.ts',
  'observability-tools.ts',
  'knowledge-tools.ts',
  'qa-tools.ts',
  'portfolio-tools.ts',
  'scheduler-tools.ts',
  'cross-repo-tools.ts',
  'setup-tools.ts',
  'integration-tools.ts',
  'utility-tools.ts',
];

function extractTools(content) {
  const tools = [];
  const objRegex =
    /\{\s*name:\s*['"]([a-z_][a-z0-9_]*)['"]\s*,\s*description:\s*([\s\S]*?),\s*inputSchema/g;
  let m;
  while ((m = objRegex.exec(content)) !== null) {
    const name = m[1];
    let descRaw = m[2].trim();
    let desc;
    if (descRaw.startsWith('`')) {
      desc = descRaw.slice(1, -1);
    } else {
      const parts = [];
      const partRegex = /(['"])((?:\\.|(?!\1).)*)\1/gs;
      let p;
      while ((p = partRegex.exec(descRaw)) !== null) parts.push(p[2]);
      desc = parts.join('');
    }
    desc = desc
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (desc.length > 140) desc = desc.slice(0, 137).trimEnd() + '...';
    tools.push({ name, description: desc });
  }
  return tools;
}

const files = readdirSync(TOOLS_DIR)
  .filter((f) => f.endsWith('.ts'))
  .sort();

const byFile = new Map();
for (const f of files) {
  const tools = extractTools(readFileSync(join(TOOLS_DIR, f), 'utf8'));
  if (tools.length > 0) byFile.set(f, tools);
}

const orderedFiles = [
  ...SECTION_ORDER.filter((f) => byFile.has(f)),
  ...[...byFile.keys()].filter((f) => !SECTION_ORDER.includes(f)),
];

let total = 0;
for (const f of orderedFiles) total += byFile.get(f).length;

const lines = [];
lines.push('# MCP Tools Reference');
lines.push('');
lines.push(
  `Complete catalog of **${total} MCP tools** exposed by the protoLabs server. See \`packages/mcp-server/src/tools/\` for the full definitions.`
);
lines.push('');
lines.push(
  'For installation and configuration, see [Claude Plugin Setup](../integrations/claude-plugin.md). For commands and examples, see [Plugin Commands](../integrations/plugin-commands.md).'
);
lines.push('');
lines.push(
  '> This page is generated from `packages/mcp-server/src/tools/*.ts`. Regenerate with `node scripts/gen-mcp-tools-doc.mjs`.'
);
lines.push('');

for (const f of orderedFiles) {
  const tools = byFile.get(f);
  const section = FILE_TO_SECTION[f] || f.replace(/-tools\.ts$/, '').replace(/-/g, ' ');
  lines.push(`## ${section} (${tools.length} tools)`);
  lines.push('');
  const nameW = Math.max('Tool'.length, ...tools.map((t) => `\`${t.name}\``.length));
  const descW = Math.max('Description'.length, ...tools.map((t) => t.description.length));
  lines.push(`| ${'Tool'.padEnd(nameW)} | ${'Description'.padEnd(descW)} |`);
  lines.push(`| ${'-'.repeat(nameW)} | ${'-'.repeat(descW)} |`);
  for (const t of tools) {
    lines.push(`| ${('`' + t.name + '`').padEnd(nameW)} | ${t.description.padEnd(descW)} |`);
  }
  lines.push('');
}

writeFileSync(OUT_PATH, lines.join('\n'));
process.stderr.write(
  `Wrote ${OUT_PATH} — ${total} tools across ${orderedFiles.length} sections.\n`
);
