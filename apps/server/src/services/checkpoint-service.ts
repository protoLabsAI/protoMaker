/**
 * Checkpoint Service
 *
 * Intercepts Write and Edit tool executions in the chat pipeline to maintain
 * per-session file state snapshots. Enables rewinding file modifications to
 * any prior message-turn checkpoint.
 *
 * Data model:
 *   sessions: Map<sessionId, CheckpointEntry[]>
 *
 * Each CheckpointEntry is created at the start of a user message turn and
 * accumulates FileSnapshots as Write / Edit tools execute during that turn.
 *
 * rewind(sessionId, checkpointId) restores every file modified at or after the
 * target checkpoint to the state it held when the checkpoint was created:
 *   - Files that existed before the checkpoint: restored to originalContent.
 *   - Files created after the checkpoint (originalContent === null): deleted.
 *   - All checkpoints at or after the rewound checkpoint are discarded.
 */

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createLogger } from '@protolabsai/utils';

const logger = createLogger('CheckpointService');

// ── Types ─────────────────────────────────────────────────────────────────────

/** Snapshot of a single file captured before a Write or Edit tool modifies it. */
export interface FileSnapshot {
  /** Absolute path to the file */
  filePath: string;
  /**
   * File content at capture time.
   * `null` means the file did not exist — it will be created by the Write tool.
   */
  originalContent: string | null;
}

/** A single checkpoint entry within a session */
export interface CheckpointEntry {
  /** Unique UUID for this checkpoint */
  checkpointId: string;
  /** ID of the user message that initiated this turn */
  messageId: string;
  /** ISO timestamp when the checkpoint was created */
  timestamp: string;
  /** File snapshots captured before modification during this turn */
  fileSnapshots: FileSnapshot[];
}

// ── Service ───────────────────────────────────────────────────────────────────

export class CheckpointService {
  /** Per-session checkpoint history: sessionId → ordered list of checkpoints */
  private readonly sessions = new Map<string, CheckpointEntry[]>();

  // ── Checkpoint lifecycle ──────────────────────────────────────────────────

  /**
   * Create a new checkpoint at the start of a user message turn.
   * @returns The checkpointId for this turn (used to associate file captures)
   */
  createCheckpoint(sessionId: string, messageId: string): string {
    const checkpointId = randomUUID();
    const checkpoint: CheckpointEntry = {
      checkpointId,
      messageId,
      timestamp: new Date().toISOString(),
      fileSnapshots: [],
    };
    const checkpoints = this.sessions.get(sessionId) ?? [];
    checkpoints.push(checkpoint);
    this.sessions.set(sessionId, checkpoints);
    logger.debug(`Checkpoint created: session=${sessionId} checkpoint=${checkpointId}`);
    return checkpointId;
  }

  // ── Pre-tool capture ──────────────────────────────────────────────────────

  /**
   * Capture the current state of a file before a Write or Edit tool modifies it.
   *
   * Idempotent: if the same filePath has already been captured within the given
   * checkpoint, the call is a no-op.
   */
  async captureFileState(sessionId: string, checkpointId: string, filePath: string): Promise<void> {
    const checkpoints = this.sessions.get(sessionId);
    if (!checkpoints) return;

    const checkpoint = checkpoints.find((c) => c.checkpointId === checkpointId);
    if (!checkpoint) return;

    // Idempotent — skip if already captured in this checkpoint
    if (checkpoint.fileSnapshots.some((s) => s.filePath === filePath)) return;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      checkpoint.fileSnapshots.push({ filePath, originalContent: content });
      logger.debug(`File state captured: ${filePath}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        // File does not exist yet — it will be created by Write
        checkpoint.fileSnapshots.push({ filePath, originalContent: null });
        logger.debug(`New-file tracked (to be created): ${filePath}`);
      } else {
        logger.warn(`Failed to capture file state for ${filePath}:`, err);
      }
    }
  }

  // ── Rewind ────────────────────────────────────────────────────────────────

  /**
   * Restore all files modified at or after the given checkpoint to their state
   * at checkpoint creation time.
   *
   * Algorithm:
   *   For each unique file path appearing in any checkpoint at or after the
   *   target, use the snapshot from the *earliest* such checkpoint — that
   *   snapshot reflects the file's state just before the targeted turn began.
   *     • originalContent !== null  → write content back to disk
   *     • originalContent === null  → file was created post-checkpoint → delete it
   *
   * After restoration all checkpoints at or after the rewound index are removed
   * from the session so the history stays consistent.
   *
   * @returns Number of files restored / deleted
   */
  async rewind(sessionId: string, checkpointId: string): Promise<number> {
    const checkpoints = this.sessions.get(sessionId);
    if (!checkpoints) {
      logger.warn(`rewind: session ${sessionId} not found`);
      return 0;
    }

    const checkpointIndex = checkpoints.findIndex((c) => c.checkpointId === checkpointId);
    if (checkpointIndex === -1) {
      logger.warn(`rewind: checkpoint ${checkpointId} not found in session ${sessionId}`);
      return 0;
    }

    // Build a map of filePath → originalContent using the earliest snapshot for
    // each file across all checkpoints from the target onward (inclusive).
    const snapshotsToRestore = new Map<string, string | null>();
    for (let i = checkpointIndex; i < checkpoints.length; i++) {
      for (const snapshot of checkpoints[i].fileSnapshots) {
        if (!snapshotsToRestore.has(snapshot.filePath)) {
          snapshotsToRestore.set(snapshot.filePath, snapshot.originalContent);
        }
      }
    }

    let restoredCount = 0;
    for (const [filePath, originalContent] of snapshotsToRestore) {
      try {
        if (originalContent === null) {
          // File was created after the checkpoint — delete it
          await fs.unlink(filePath);
          logger.info(`rewind: deleted post-checkpoint file ${filePath}`);
        } else {
          // Restore the file to its pre-checkpoint content
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, originalContent, 'utf-8');
          logger.info(`rewind: restored ${filePath}`);
        }
        restoredCount++;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          logger.warn(`rewind: failed to process ${filePath}:`, err);
        }
      }
    }

    // Discard all checkpoints at and after the rewound index
    checkpoints.splice(checkpointIndex);
    this.sessions.set(sessionId, checkpoints);

    logger.info(
      `rewind complete: session=${sessionId} checkpoint=${checkpointId} filesProcessed=${restoredCount}`
    );
    return restoredCount;
  }

  // ── Session queries ───────────────────────────────────────────────────────

  /**
   * Get all checkpoints for a session (ordered, read-only view).
   */
  getCheckpoints(sessionId: string): ReadonlyArray<CheckpointEntry> {
    return this.sessions.get(sessionId) ?? [];
  }

  /**
   * Remove all checkpoint data for a session.
   * Call when the user's chat session ends to free memory.
   */
  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    logger.debug(`Session cleared: ${sessionId}`);
  }
}
