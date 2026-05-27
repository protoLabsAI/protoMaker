/**
 * Training-data capture for fast-tier micro-tasks (#3859).
 *
 * Several pipeline micro-tasks route to the fast model (branch names, feature
 * titles, …). Each is narrow and high-volume — ideal to distill into a small
 * purpose-built model later. This module captures input→output pairs as JSONL
 * so that corpus accrues passively.
 *
 * Fail-open by design: capture must NEVER break the task it observes. Every
 * function swallows its own errors.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Known fast-tier task kinds — one capture file per task under .automaker/training/. */
export type FastTaskKind = 'branch-name' | 'feature-title';

export interface TrainingRow {
  /** The fast-task kind (also the capture sub-directory). */
  task: FastTaskKind;
  /** Model alias used (e.g. 'protolabs/fast', 'haiku'). */
  model: string;
  /** Task input (prompt-shaping fields). */
  input: Record<string, unknown>;
  /** The produced output, or a sentinel when the deterministic fallback was used. */
  output: string;
  /** True when the model output was rejected/unused and a fallback was taken. */
  usedFallback?: boolean;
}

/**
 * Append a training row to `.automaker/training/{task}/captures.jsonl`.
 * Never throws — a capture failure must not affect the observed task.
 */
export async function captureTrainingRow(projectPath: string, row: TrainingRow): Promise<void> {
  try {
    const dir = path.join(projectPath, '.automaker', 'training', row.task);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.appendFile(
      path.join(dir, 'captures.jsonl'),
      JSON.stringify({ ...row, timestamp: new Date().toISOString() }) + '\n',
      'utf-8'
    );
  } catch {
    // non-blocking — capture is best-effort
  }
}
