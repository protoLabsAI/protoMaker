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
  '@protolabsai/types',
  '@protolabsai/utils',
  '@protolabsai/platform',
  '@protolabsai/prompts',
  '@protolabsai/tools',
  '@protolabsai/model-resolver',
  '@protolabsai/dependency-resolver',
  '@protolabsai/spec-parser',
  '@protolabsai/flows',
  '@protolabsai/observability',
  '@protolabsai/git-utils',
  '@protolabsai/mcp-server',
  '@protolabsai/ui',
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
  // Use --first-parent to walk the main branch, then for each merge commit,
  // also inspect the merged branch's commits. This ensures feat: commits
  // inside promotion merges (staging → main) are counted for version bumps.
  const log = run(`git log ${ref}..HEAD --pretty=format:"%H %s"`);
  if (!log) return [];

  const subjects = [];
  for (const line of log.split('\n')) {
    const raw = line.replace(/^"|"$/g, '');
    const spaceIdx = raw.indexOf(' ');
    if (spaceIdx === -1) continue;
    const hash = raw.slice(0, spaceIdx);
    const subject = raw.slice(spaceIdx + 1);
    subjects.push(subject);

    // If this is a merge commit, also collect subjects from the merged branch
    try {
      const parents = run(`git cat-file -p ${hash}`)
        .split('\n')
        .filter((l) => l.startsWith('parent '))
        .map((l) => l.slice(7));
      if (parents.length >= 2) {
        const mergedLog = run(`git log ${parents[0]}..${parents[1]} --pretty=format:"%s"`);
        if (mergedLog) {
          for (const ml of mergedLog.split('\n')) {
            subjects.push(ml.replace(/^"|"$/g, ''));
          }
        }
      }
    } catch {
      // Not a merge commit or can't read parents — skip
    }
  }

  // Deduplicate: the linear log walk and the merge expansion can collect
  // the same commit subject twice (once from the linear walk, once from
  // expanding the merge). Remove duplicates while preserving order.
  return [...new Set(subjects)];
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
