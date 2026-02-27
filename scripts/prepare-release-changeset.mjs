#!/usr/bin/env node
/**
 * Auto-generate a changeset from conventional commits since the last release tag.
 *
 * Determines bump type from commit prefixes:
 *   - feat: → minor
 *   - fix:, perf:, refactor: → patch
 *   - BREAKING CHANGE in body → major
 *
 * Usage: npm run release:prepare
 * Creates .changeset/<id>.md with the summary.
 */

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const FIXED_PACKAGES = [
  '@protolabs-ai/types',
  '@protolabs-ai/utils',
  '@protolabs-ai/platform',
  '@protolabs-ai/prompts',
  '@protolabs-ai/tools',
  '@protolabs-ai/model-resolver',
  '@protolabs-ai/dependency-resolver',
  '@protolabs-ai/spec-parser',
  '@protolabs-ai/flows',
  '@protolabs-ai/observability',
  '@protolabs-ai/git-utils',
  '@protolabs-ai/mcp-server',
  '@protolabs-ai/ui',
];

function run(cmd) {
  return execSync(cmd, { encoding: 'utf-8' }).trim();
}

function getLastTag() {
  try {
    return run('git describe --tags --abbrev=0');
  } catch {
    // No tags exist — use the root commit
    return run('git rev-list --max-parents=0 HEAD');
  }
}

function getCommitsSince(ref) {
  const log = run(`git log ${ref}..HEAD --pretty=format:"%s"`);
  if (!log) return [];
  return log.split('\n').map((line) => line.replace(/^"|"$/g, ''));
}

function classifyBump(commits) {
  let bump = 'patch';

  for (const msg of commits) {
    if (msg.includes('BREAKING CHANGE') || msg.includes('!:')) {
      return 'major';
    }
    if (msg.startsWith('feat') || msg.startsWith('epic')) {
      bump = 'minor';
    }
  }

  return bump;
}

function groupCommits(commits) {
  const groups = {
    feat: [],
    fix: [],
    perf: [],
    refactor: [],
    other: [],
  };

  for (const msg of commits) {
    const match = msg.match(/^(\w+)(?:\(.+?\))?:\s*(.+)/);
    if (!match) {
      groups.other.push(msg);
      continue;
    }
    const [, type, description] = match;
    if (type in groups) {
      groups[type].push(description);
    } else if (type === 'epic') {
      groups.feat.push(description);
    } else {
      groups.other.push(msg);
    }
  }

  return groups;
}

function buildSummary(groups, bump) {
  const lines = [];

  if (groups.feat.length) {
    lines.push('### Features');
    for (const d of groups.feat) lines.push(`- ${d}`);
    lines.push('');
  }
  if (groups.fix.length) {
    lines.push('### Bug Fixes');
    for (const d of groups.fix) lines.push(`- ${d}`);
    lines.push('');
  }
  if (groups.perf.length) {
    lines.push('### Performance');
    for (const d of groups.perf) lines.push(`- ${d}`);
    lines.push('');
  }
  if (groups.refactor.length) {
    lines.push('### Refactors');
    for (const d of groups.refactor) lines.push(`- ${d}`);
    lines.push('');
  }

  if (!lines.length) {
    lines.push('Maintenance release.');
  }

  return lines.join('\n').trim();
}

// --- Main ---

const lastTag = getLastTag();
const commits = getCommitsSince(lastTag);

if (!commits.length) {
  console.log(`No commits since ${lastTag}. Nothing to release.`);
  process.exit(0);
}

const bump = classifyBump(commits);
const groups = groupCommits(commits);
const summary = buildSummary(groups, bump);

// Build changeset file
const id = randomBytes(4).toString('hex');
const packageLines = FIXED_PACKAGES.map((pkg) => `'${pkg}': ${bump}`).join('\n');

const content = `---
${packageLines}
---

${summary}
`;

const changesetDir = join(process.cwd(), '.changeset');
mkdirSync(changesetDir, { recursive: true });

const filePath = join(changesetDir, `release-${id}.md`);
writeFileSync(filePath, content, 'utf-8');

console.log(`Created changeset: .changeset/release-${id}.md`);
console.log(`Bump type: ${bump}`);
console.log(`Commits analyzed: ${commits.length} since ${lastTag}`);
console.log(`\nSummary:\n${summary}`);
