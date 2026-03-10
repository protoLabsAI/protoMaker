/**
 * Verification test for ProjectTimelineService
 * Tests append and retrieval of timeline entries in a temp directory.
 * Run with: node verify-ceremony-timeline.mjs
 */

import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import the compiled service from dist (built in main repo)
const { projectTimelineService } = await import(
  '/Users/kj/dev/automaker/apps/server/dist/services/project-timeline-service.js'
);

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

// Create a temp directory as projectPath
const tmpDir = await mkdtemp(path.join(tmpdir(), 'ceremony-timeline-test-'));

try {
  const slug = 'test-project';

  console.log('\n--- Test: Append entry to empty timeline ---');
  const entry = await projectTimelineService.appendEntry(tmpDir, slug, {
    type: 'standup',
    content: '## Daily Standup\n- Did: wrote tests\n- Doing: reviewing PRs',
    author: 'pm',
  });
  assert(typeof entry.id === 'string' && entry.id.length > 0, 'entry has an id');
  assert(entry.type === 'standup', 'entry type is standup');
  assert(entry.author === 'pm', 'entry author is pm');
  assert(entry.content.includes('Daily Standup'), 'entry content preserved');
  assert(typeof entry.timestamp === 'string', 'entry has a timestamp');
  assert(entry.metadata === undefined, 'no metadata when not provided');

  console.log('\n--- Test: Append entry with metadata ---');
  const entry2 = await projectTimelineService.appendEntry(tmpDir, slug, {
    type: 'decision',
    content: 'Decided to use append-only storage.',
    author: 'ava',
    metadata: { decisionId: 'D-001', impact: 'high' },
  });
  assert(entry2.type === 'decision', 'second entry type is decision');
  assert(entry2.metadata?.decisionId === 'D-001', 'metadata preserved');

  console.log('\n--- Test: Get timeline returns all entries ---');
  const result = await projectTimelineService.getTimeline(tmpDir, slug);
  assert(result.total === 2, `total is 2 (got ${result.total})`);
  assert(result.entries.length === 2, `entries has 2 items (got ${result.entries.length})`);
  assert(result.entries[0].type === 'standup', 'first entry is standup');
  assert(result.entries[1].type === 'decision', 'second entry is decision');

  console.log('\n--- Test: Pagination with limit ---');
  const page1 = await projectTimelineService.getTimeline(tmpDir, slug, { limit: 1 });
  assert(page1.total === 2, 'total still 2 with limit');
  assert(page1.entries.length === 1, 'limit=1 returns 1 entry');
  assert(page1.entries[0].type === 'standup', 'first page is standup');

  console.log('\n--- Test: Pagination with offset ---');
  const page2 = await projectTimelineService.getTimeline(tmpDir, slug, { limit: 1, offset: 1 });
  assert(page2.entries.length === 1, 'offset=1 returns 1 entry');
  assert(page2.entries[0].type === 'decision', 'second page is decision');

  console.log('\n--- Test: Filtering with "since" ---');
  // Wait a tick to ensure timestamps differ
  await new Promise(r => setTimeout(r, 10));
  const entry3 = await projectTimelineService.appendEntry(tmpDir, slug, {
    type: 'milestone_complete',
    content: 'Milestone 1 complete!',
    author: 'lead-engineer',
  });
  const sinceResult = await projectTimelineService.getTimeline(tmpDir, slug, {
    since: entry2.timestamp,
  });
  assert(sinceResult.entries.length === 1, 'since filter returns only entries after');
  assert(sinceResult.entries[0].id === entry3.id, 'since filter returns the right entry');

  console.log('\n--- Test: Empty timeline on non-existent project ---');
  const emptyResult = await projectTimelineService.getTimeline(tmpDir, 'does-not-exist');
  assert(emptyResult.total === 0, 'empty timeline for missing project');
  assert(emptyResult.entries.length === 0, 'entries array is empty');

  console.log('\n--- Test: Entries persist across re-reads ---');
  const persisted = await projectTimelineService.getTimeline(tmpDir, slug);
  assert(persisted.total === 3, `persisted 3 entries (got ${persisted.total})`);

} finally {
  await rm(tmpDir, { recursive: true, force: true });
}

console.log(`\n${'='.repeat(50)}`);
if (failed === 0) {
  console.log(`All ${passed} tests passed.`);
} else {
  console.log(`${passed} passed, ${failed} FAILED`);
  process.exit(1);
}
