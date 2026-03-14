/**
 * POST /api/ledger/backfill-project-slug
 *
 * One-time migration: reads the events.jsonl file, enriches entries that have a
 * featureId but are missing a projectSlug by looking up the feature's current
 * projectSlug, and rewrites the file atomically.
 *
 * A backup of the original file is created before rewriting.
 *
 * Idempotent — entries that already have a projectSlug are left unchanged.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import type { Request, Response } from 'express';
import { createLogger } from '@protolabsai/utils';
import type { EventLedgerEntry } from '@protolabsai/types';
import type { FeatureLoader } from '../../../services/feature-loader.js';

const logger = createLogger('ledger/backfill-project-slug');

interface BackfillRequest {
  /** Absolute path to the project root — used to look up feature data */
  projectPath: string;
}

export function createBackfillLedgerProjectSlugHandler(
  featureLoader: FeatureLoader,
  dataDir: string
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as BackfillRequest;

      if (typeof projectPath !== 'string' || projectPath.trim().length === 0) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const ledgerPath = path.join(dataDir, 'ledger', 'events.jsonl');

      // Nothing to do if the file doesn't exist yet
      if (!fs.existsSync(ledgerPath)) {
        res.json({ success: true, total: 0, enriched: 0, alreadyHadSlug: 0, noFeatureId: 0 });
        return;
      }

      // --- Read all entries ---
      const entries: EventLedgerEntry[] = [];
      try {
        const rl = readline.createInterface({
          input: fs.createReadStream(ledgerPath, 'utf-8'),
          crlfDelay: Infinity,
        });
        for await (const line of rl) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            entries.push(JSON.parse(trimmed) as EventLedgerEntry);
          } catch {
            logger.warn(`Skipping malformed ledger line: ${trimmed.slice(0, 100)}`);
          }
        }
      } catch (readErr) {
        const msg = readErr instanceof Error ? readErr.message : String(readErr);
        logger.error('Failed to read events.jsonl:', readErr);
        res.status(500).json({ success: false, error: `Failed to read ledger: ${msg}` });
        return;
      }

      // --- Build feature → projectSlug cache (load all features once) ---
      const featureSlugCache = new Map<string, string>();
      try {
        const allFeatures = await featureLoader.getAll(projectPath);
        for (const feature of allFeatures) {
          if (feature.projectSlug) {
            featureSlugCache.set(feature.id, feature.projectSlug);
          }
        }
        logger.info(
          `Backfill: loaded ${allFeatures.length} features, ` +
            `${featureSlugCache.size} have projectSlug`
        );
      } catch (loadErr) {
        logger.warn('Backfill: failed to load features, enrichment will be limited:', loadErr);
      }

      // --- Enrich entries ---
      let enriched = 0;
      let alreadyHadSlug = 0;
      let noFeatureId = 0;

      const enrichedEntries = entries.map((entry) => {
        const featureId = entry.correlationIds?.featureId;

        if (!featureId) {
          noFeatureId++;
          return entry;
        }

        if (entry.correlationIds.projectSlug) {
          alreadyHadSlug++;
          return entry;
        }

        const projectSlug = featureSlugCache.get(featureId);
        if (!projectSlug) {
          // Feature not found or has no projectSlug — leave as-is
          return entry;
        }

        enriched++;
        return {
          ...entry,
          correlationIds: {
            ...entry.correlationIds,
            projectSlug,
          },
        };
      });

      // --- Backup original file ---
      const backupPath = ledgerPath + '.bak';
      try {
        await fs.promises.copyFile(ledgerPath, backupPath);
        logger.info(`Backfill: backup created at ${backupPath}`);
      } catch (backupErr) {
        const msg = backupErr instanceof Error ? backupErr.message : String(backupErr);
        logger.error('Backfill: failed to create backup:', backupErr);
        res.status(500).json({ success: false, error: `Failed to create backup: ${msg}` });
        return;
      }

      // --- Atomically rewrite the ledger file ---
      const tmpPath = ledgerPath + '.tmp';
      try {
        const lines = enrichedEntries.map((e) => JSON.stringify(e)).join('\n') + '\n';
        await fs.promises.writeFile(tmpPath, lines, 'utf-8');
        await fs.promises.rename(tmpPath, ledgerPath);
      } catch (writeErr) {
        const msg = writeErr instanceof Error ? writeErr.message : String(writeErr);
        logger.error('Backfill: failed to rewrite ledger file:', writeErr);
        // Clean up temp file if it exists
        try {
          await fs.promises.unlink(tmpPath);
        } catch {
          // Ignore cleanup errors
        }
        res.status(500).json({ success: false, error: `Failed to rewrite ledger: ${msg}` });
        return;
      }

      logger.info(
        `Backfill complete: ${enriched} enriched, ${alreadyHadSlug} already had slug, ` +
          `${noFeatureId} had no featureId, ${entries.length} total`
      );

      res.json({
        success: true,
        total: entries.length,
        enriched,
        alreadyHadSlug,
        noFeatureId,
        backupPath,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Backfill ledger project slug failed:', error);
      res.status(500).json({ success: false, error: msg });
    }
  };
}
