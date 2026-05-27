/**
 * Unit tests for the shared fast-tier training-data capture (#3859).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fsSync from 'node:fs';
import { captureTrainingRow } from '../../../src/services/training-capture.js';

describe('captureTrainingRow', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'training-capture-'));
  });
  afterEach(() => {
    fsSync.rmSync(tempDir, { recursive: true, force: true });
  });

  it('appends a JSONL row under .automaker/training/{task}/captures.jsonl', async () => {
    await captureTrainingRow(tempDir, {
      task: 'branch-name',
      model: 'protolabs/nano',
      input: { title: 'Add auth' },
      output: 'feat/add-auth-abc1234',
      usedFallback: false,
    });

    const file = path.join(tempDir, '.automaker', 'training', 'branch-name', 'captures.jsonl');
    expect(fsSync.existsSync(file)).toBe(true);
    const row = JSON.parse(fsSync.readFileSync(file, 'utf-8').trim());
    expect(row).toMatchObject({
      task: 'branch-name',
      model: 'protolabs/nano',
      output: 'feat/add-auth-abc1234',
      usedFallback: false,
    });
    expect(typeof row.timestamp).toBe('string');
  });

  it('separates rows by task and appends (one line per call)', async () => {
    await captureTrainingRow(tempDir, {
      task: 'feature-title',
      model: 'protolabs/nano',
      input: { description: 'x' },
      output: 'Title One',
    });
    await captureTrainingRow(tempDir, {
      task: 'feature-title',
      model: 'protolabs/nano',
      input: { description: 'y' },
      output: 'Title Two',
    });

    const file = path.join(tempDir, '.automaker', 'training', 'feature-title', 'captures.jsonl');
    const lines = fsSync.readFileSync(file, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]).output).toBe('Title Two');
    // branch-name dir must NOT exist (task isolation)
    expect(fsSync.existsSync(path.join(tempDir, '.automaker', 'training', 'branch-name'))).toBe(
      false
    );
  });

  it('is fail-open — never throws on an unwritable path', async () => {
    // A path under a file (not a dir) can't be mkdir'd → must swallow.
    const filePath = path.join(tempDir, 'not-a-dir');
    fsSync.writeFileSync(filePath, 'x');
    await expect(
      captureTrainingRow(filePath, {
        task: 'branch-name',
        model: 'protolabs/nano',
        input: {},
        output: 'x',
      })
    ).resolves.toBeUndefined();
  });
});
