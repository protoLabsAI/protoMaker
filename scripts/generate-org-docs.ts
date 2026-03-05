#!/usr/bin/env tsx
/**
 * Generate organization and team role documentation from built-in agent templates.
 *
 * Reads the built-in agent templates and a hierarchy definition to produce:
 * - docs/authority/roles.md — Team roster with capabilities and descriptions
 * - Updates the org chart section in docs/authority/org-chart.md
 *
 * Usage:
 *   npx tsx scripts/generate-org-docs.ts
 *   npm run generate:org-docs
 *
 * Run this after adding/removing agents in built-in-templates.ts.
 */

import { writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { AgentTemplate } from '@protolabsai/types';
import { buildTemplates } from '../apps/server/src/services/built-in-templates.js';

const BUILT_IN_TEMPLATES = buildTemplates();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Hierarchy definition
// ---------------------------------------------------------------------------

interface OrgNode {
  /** Template name (matches AgentTemplate.name) or special 'josh' */
  name: string;
  /** Override display name (for non-template entries like Josh) */
  displayName?: string;
  /** 'human' | 'ai' */
  type: 'human' | 'ai';
  /** Team label shown next to the node */
  team?: string;
  /** Template names of direct reports */
  reports: string[];
  /** Short role description (used for Josh who has no template) */
  roleLabel?: string;
}

/**
 * Organizational hierarchy. Order matters — it determines display order.
 * Every template from buildTemplates() should appear in exactly one `reports` array.
 */
const ORG_HIERARCHY: OrgNode[] = [
  {
    name: 'josh',
    displayName: 'Josh Mabry',
    type: 'human',
    roleLabel: 'CEO & Founder',
    reports: ['ava', 'jon'],
  },
  {
    name: 'ava',
    type: 'ai',
    team: 'Engineering',
    reports: [
      'matt',
      'sam',
      'frank',
      'cindi',
      'backend-engineer',
      'product-manager',
      'engineering-manager',
      'pr-maintainer',
      'board-janitor',
    ],
  },
  {
    name: 'jon',
    type: 'ai',
    team: 'Go-to-Market',
    reports: [],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = join(__dirname, '..');
const DOCS_DIR = join(ROOT, 'docs', 'authority');

function findTemplate(name: string): AgentTemplate | undefined {
  return BUILT_IN_TEMPLATES.find((t) => t.name === name);
}

function trustLabel(level?: number): string {
  switch (level) {
    case 0:
      return 'Manual';
    case 1:
      return 'Assisted';
    case 2:
      return 'Conditional';
    case 3:
      return 'Autonomous';
    default:
      return 'Unknown';
  }
}

function capabilitySummary(t: AgentTemplate): string {
  const caps: string[] = [];
  if (t.canUseBash) caps.push('Bash');
  if (t.canModifyFiles) caps.push('Edit');
  if (t.canCommit) caps.push('Commit');
  if (t.canCreatePRs) caps.push('PR');
  if (t.canSpawnAgents) caps.push('Spawn');
  return caps.length > 0 ? caps.join(', ') : 'Read-only';
}

function exposureSummary(t: AgentTemplate): string {
  const parts: string[] = [];
  if (t.exposure?.cli) parts.push('CLI');
  if (t.exposure?.discord) parts.push('Discord');
  return parts.length > 0 ? parts.join(', ') : 'Internal';
}

function displayName(name: string): string {
  const node = ORG_HIERARCHY.find((n) => n.name === name);
  if (node?.displayName) return node.displayName;
  const tmpl = findTemplate(name);
  return tmpl?.displayName ?? name;
}

function modelLabel(model?: string): string {
  if (!model) return 'Sonnet';
  return model.charAt(0).toUpperCase() + model.slice(1);
}

function anchor(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

// ---------------------------------------------------------------------------
// Org chart ASCII tree
// ---------------------------------------------------------------------------

function generateOrgTree(): string {
  const lines: string[] = [];

  function nodeLabel(name: string): string {
    const dn = displayName(name);
    const tmpl = findTemplate(name);
    const node = ORG_HIERARCHY.find((n) => n.name === name);

    if (name === 'josh') {
      return `${dn} (CEO, Human)`;
    }

    const parts = [dn];
    if (tmpl) {
      parts.push(modelLabel(tmpl.model));
      if (tmpl.trustLevel !== undefined) parts.push(`Trust=${tmpl.trustLevel}`);
    }
    const label = parts.join(', ');
    const teamSuffix = node?.team ? ` — ${node.team}` : '';
    return `${label}${teamSuffix}`;
  }

  // Josh (root)
  lines.push(nodeLabel('josh'));

  const josh = ORG_HIERARCHY.find((n) => n.name === 'josh')!;
  josh.reports.forEach((reportName, ri) => {
    const isLastReport = ri === josh.reports.length - 1;
    const reportPrefix = isLastReport ? '└── ' : '├── ';
    const childIndent = isLastReport ? '    ' : '│   ';

    lines.push(`${reportPrefix}${nodeLabel(reportName)}`);

    const reportNode = ORG_HIERARCHY.find((n) => n.name === reportName);
    if (reportNode && reportNode.reports.length > 0) {
      reportNode.reports.forEach((childName, ci) => {
        const isLastChild = ci === reportNode.reports.length - 1;
        const childPrefix = isLastChild ? '└── ' : '├── ';
        lines.push(`${childIndent}${childPrefix}${nodeLabel(childName)}`);
      });
    }
  });

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Roles document generation
// ---------------------------------------------------------------------------

function generateAgentSection(name: string, reportsToName: string): string {
  const tmpl = findTemplate(name);
  if (!tmpl) return '';

  const dn = tmpl.displayName;
  const node = ORG_HIERARCHY.find((n) => n.name === name);
  const reportsTo = displayName(reportsToName);
  const hasReports = node && node.reports.length > 0;

  let section = `## ${dn} {#${anchor(name)}}\n\n`;
  section += `**Type:** AI\n`;
  section += `**Role:** ${tmpl.role}\n`;
  section += `**Model:** ${modelLabel(tmpl.model)}\n`;
  section += `**Trust Level:** ${tmpl.trustLevel ?? 1} (${trustLabel(tmpl.trustLevel)})\n`;
  section += `**Reports to:** ${reportsTo}\n`;
  section += `**Exposure:** ${exposureSummary(tmpl)}\n`;
  section += `**Capabilities:** ${capabilitySummary(tmpl)}\n`;

  if (tmpl.tags && tmpl.tags.length > 0) {
    section += `**Tags:** ${tmpl.tags.join(', ')}\n`;
  }

  section += `\n### Description\n\n${tmpl.description}\n`;

  if (hasReports) {
    section += `\n### Direct Reports\n\n`;
    for (const reportName of node!.reports) {
      const rt = findTemplate(reportName);
      if (rt) {
        section += `- [${rt.displayName}](#${anchor(reportName)}) — ${rt.description.split('.')[0]}\n`;
      }
    }
  }

  if (tmpl.canSpawnAgents && tmpl.allowedSubagentRoles?.length) {
    section += `\n### Delegation\n\n`;
    section += `Can spawn sub-agents with roles: ${tmpl.allowedSubagentRoles.join(', ')}\n`;
  }

  return section;
}

function generateRolesDoc(): string {
  const timestamp = new Date().toISOString().split('T')[0];
  const orgTree = generateOrgTree();

  let doc = `# Team Roles\n\n`;
  doc += `> Auto-generated from \`built-in-templates.ts\`. Run \`npx tsx scripts/generate-org-docs.ts\` to update.\n`;
  doc += `>\n> Last generated: ${timestamp}\n\n`;

  // Org chart
  doc += `## Organization Chart\n\n`;
  doc += '```text\n' + orgTree + '\n```\n\n';

  // Active roster table
  doc += `## Active Roster\n\n`;
  doc += `| Agent | Role | Model | Trust | Reports To | Capabilities | Exposure |\n`;
  doc += `| ----- | ---- | ----- | ----- | ---------- | ------------ | -------- |\n`;

  // Josh row
  doc += `| **Josh Mabry** | CEO & Founder | — | 3 (Autonomous) | — | All | — |\n`;

  // All template agents in hierarchy order
  const allAgents = collectAgentsInOrder();
  for (const { name, reportsTo } of allAgents) {
    const tmpl = findTemplate(name);
    if (!tmpl) continue;
    const dn = tmpl.displayName;
    doc += `| [${dn}](#${anchor(name)}) | ${tmpl.role} | ${modelLabel(tmpl.model)} | ${tmpl.trustLevel ?? 1} (${trustLabel(tmpl.trustLevel)}) | ${displayName(reportsTo)} | ${capabilitySummary(tmpl)} | ${exposureSummary(tmpl)} |\n`;
  }

  doc += `\n`;

  // Josh section
  doc += `## Josh Mabry {#josh}\n\n`;
  doc += `**Type:** Human\n`;
  doc += `**Role:** CEO & Founder\n`;
  doc += `**Trust Level:** 3 (Autonomous)\n\n`;
  doc += `### Description\n\n`;
  doc += `Technical architecture decisions, product vision, hands-on coding. The goal is to offload everything that isn't creative vision and deep technical work to the AI team.\n\n`;
  doc += `### Direct Reports\n\n`;
  const josh = ORG_HIERARCHY.find((n) => n.name === 'josh')!;
  for (const reportName of josh.reports) {
    const rt = findTemplate(reportName);
    if (rt) {
      doc += `- [${rt.displayName}](#${anchor(reportName)}) — ${rt.description.split('.')[0]}\n`;
    }
  }
  doc += `\n---\n\n`;

  // Agent sections in hierarchy order
  for (const { name, reportsTo } of allAgents) {
    const section = generateAgentSection(name, reportsTo);
    if (section) {
      doc += section + '\n---\n\n';
    }
  }

  // Unassigned templates warning
  const assignedNames = new Set(allAgents.map((a) => a.name));
  const unassigned = BUILT_IN_TEMPLATES.filter((t) => !assignedNames.has(t.name));
  if (unassigned.length > 0) {
    doc += `## Unassigned Templates\n\n`;
    doc += `These templates exist in the registry but are not placed in the org hierarchy:\n\n`;
    for (const t of unassigned) {
      doc += `- **${t.displayName}** (${t.name}) — ${t.description}\n`;
    }
    doc += `\n`;
  }

  // How to add
  doc += `## Adding a New Team Member\n\n`;
  doc += `1. Create a prompt file in \`libs/prompts/src/agents/<name>.ts\`\n`;
  doc += `2. Register the prompt in \`libs/prompts/src/prompt-registry.ts\`\n`;
  doc += `3. Add the template to \`apps/server/src/services/built-in-templates.ts\`\n`;
  doc += `4. Add the agent to the \`ORG_HIERARCHY\` in \`scripts/generate-org-docs.ts\`\n`;
  doc += `5. Run \`npx tsx scripts/generate-org-docs.ts\` to regenerate this document\n`;

  return doc;
}

/** Collect agents in hierarchy-first traversal order with their reportsTo info */
function collectAgentsInOrder(): Array<{ name: string; reportsTo: string }> {
  const result: Array<{ name: string; reportsTo: string }> = [];

  function traverse(parentName: string) {
    const node = ORG_HIERARCHY.find((n) => n.name === parentName);
    if (!node) return;
    for (const childName of node.reports) {
      result.push({ name: childName, reportsTo: parentName });
      traverse(childName);
    }
  }

  traverse('josh');
  return result;
}

// ---------------------------------------------------------------------------
// Org chart document update
// ---------------------------------------------------------------------------

function updateOrgChartDoc(): void {
  const orgChartPath = join(DOCS_DIR, 'org-chart.md');
  let content: string;
  try {
    content = readFileSync(orgChartPath, 'utf-8');
  } catch {
    console.log('  Skipping org-chart.md update (file not found)');
    return;
  }

  const orgTree = generateOrgTree();

  // Replace the org chart code block (between "## Organization Chart" and the next ## section)
  const startMarker = '## Organization Chart';
  const startIdx = content.indexOf(startMarker);
  if (startIdx === -1) {
    console.log('  Skipping org-chart.md update (no "## Organization Chart" section found)');
    return;
  }

  // Find the code block after the heading
  const codeStart = content.indexOf('```', startIdx);
  const codeEnd = content.indexOf('```', codeStart + 3);
  if (codeStart === -1 || codeEnd === -1) {
    console.log(
      '  Skipping org-chart.md update (no code block found in Organization Chart section)'
    );
    return;
  }

  const before = content.substring(0, codeStart);
  const after = content.substring(codeEnd + 3);
  const updated = before + '```text\n' + orgTree + '\n```' + after;

  writeFileSync(orgChartPath, updated);
  console.log('  Updated docs/authority/org-chart.md (org chart section)');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('Generating organization docs from built-in templates...');
  console.log(`  Found ${BUILT_IN_TEMPLATES.length} templates`);

  // Generate roles.md
  const rolesContent = generateRolesDoc();
  const rolesPath = join(DOCS_DIR, 'roles.md');
  writeFileSync(rolesPath, rolesContent);
  console.log(`  Generated docs/authority/roles.md`);

  // Update org chart in org-chart.md
  updateOrgChartDoc();

  // Validate: check all templates are in hierarchy
  const assignedNames = new Set(collectAgentsInOrder().map((a) => a.name));
  const unassigned = BUILT_IN_TEMPLATES.filter((t) => !assignedNames.has(t.name));
  if (unassigned.length > 0) {
    console.warn(
      `\n  WARNING: ${unassigned.length} template(s) not in org hierarchy:`,
      unassigned.map((t) => t.name).join(', ')
    );
    console.warn('  Add them to ORG_HIERARCHY in this script.');
  }

  console.log('\nDone.');
}

main();
