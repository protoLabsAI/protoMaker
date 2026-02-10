#!/usr/bin/env tsx
/**
 * Feature Status Migration Script
 *
 * Migrates legacy feature status values to canonical 6-status system:
 * - pending, ready → backlog
 * - running → in_progress
 * - completed, waiting_approval → done
 * - failed → blocked
 *
 * Usage:
 *   npm run migrate:statuses -- <project-path> [--dry-run] [--backup]
 *
 * Options:
 *   --dry-run  Show what would be changed without writing
 *   --backup   Create backup before migrating (default: true)
 */

import { readdir, readFile, writeFile, mkdir, copyFile, rename } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import type { Feature } from '@automaker/types';
import { normalizeFeatureStatus } from '@automaker/types';
import { atomicWriteJson } from '@automaker/utils';

interface MigrationStats {
  total: number;
  migrated: number;
  unchanged: number;
  errors: number;
  migrations: Array<{
    featureId: string;
    from: string;
    to: string;
  }>;
}

async function backupFeature(featurePath: string): Promise<void> {
  const backupPath = `${featurePath}.backup-${Date.now()}`;
  await copyFile(featurePath, backupPath);
  console.log(`  ✓ Backed up to ${backupPath}`);
}

async function migrateFeature(
  featurePath: string,
  dryRun: boolean,
  createBackup: boolean
): Promise<{ migrated: boolean; from?: string; to?: string; error?: string }> {
  try {
    const content = await readFile(featurePath, 'utf-8');
    const feature: Feature = JSON.parse(content);

    if (!feature.id) {
      return { migrated: false, error: 'Missing feature ID' };
    }

    const oldStatus = feature.status;
    const newStatus = normalizeFeatureStatus(oldStatus);

    // Check if migration is needed
    if (oldStatus === newStatus) {
      return { migrated: false };
    }

    console.log(`  ${feature.id}: ${oldStatus} → ${newStatus}`);

    if (!dryRun) {
      // Backup before writing
      if (createBackup) {
        await backupFeature(featurePath);
      }

      // Update feature
      const updatedFeature = { ...feature, status: newStatus };

      // Write atomically using helper
      await atomicWriteJson(featurePath, updatedFeature);
    }

    return {
      migrated: true,
      from: oldStatus,
      to: newStatus,
    };
  } catch (error) {
    return {
      migrated: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function migrateProject(
  projectPath: string,
  dryRun: boolean,
  createBackup: boolean
): Promise<MigrationStats> {
  const stats: MigrationStats = {
    total: 0,
    migrated: 0,
    unchanged: 0,
    errors: 0,
    migrations: [],
  };

  const featuresDir = join(projectPath, '.automaker', 'features');

  if (!existsSync(featuresDir)) {
    console.error(`❌ Features directory not found: ${featuresDir}`);
    process.exit(1);
  }

  console.log(`\n📂 Scanning features in: ${featuresDir}\n`);

  const featureDirs = await readdir(featuresDir, { withFileTypes: true });

  for (const dir of featureDirs) {
    if (!dir.isDirectory()) continue;

    const featureId = dir.name;
    const featurePath = join(featuresDir, featureId, 'feature.json');

    if (!existsSync(featurePath)) {
      console.log(`  ⚠️  Skipping ${featureId} (no feature.json)`);
      continue;
    }

    stats.total++;

    console.log(`\n${featureId}:`);
    const result = await migrateFeature(featurePath, dryRun, createBackup);

    if (result.error) {
      console.log(`  ❌ Error: ${result.error}`);
      stats.errors++;
    } else if (result.migrated) {
      console.log(`  ✅ Migrated`);
      stats.migrated++;
      if (result.from && result.to) {
        stats.migrations.push({
          featureId,
          from: result.from,
          to: result.to,
        });
      }
    } else {
      console.log(`  ⏭️  No change needed`);
      stats.unchanged++;
    }
  }

  return stats;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Feature Status Migration Script

Usage:
  npm run migrate:statuses -- <project-path> [--dry-run] [--backup]

Options:
  --dry-run  Show what would be changed without writing
  --backup   Create backup before migrating (default: true)
  --no-backup  Skip creating backups

Examples:
  npm run migrate:statuses -- /path/to/project --dry-run
  npm run migrate:statuses -- /path/to/project
  npm run migrate:statuses -- /path/to/project --no-backup
`);
    process.exit(0);
  }

  const projectPath = args[0];
  const dryRun = args.includes('--dry-run');
  const createBackup = !args.includes('--no-backup');

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║         Feature Status Migration Script v1.0                  ║
╚════════════════════════════════════════════════════════════════╝

Project:     ${projectPath}
Mode:        ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will modify files)'}
Backup:      ${createBackup ? 'Enabled' : 'Disabled'}
`);

  if (!existsSync(projectPath)) {
    console.error(`❌ Project path does not exist: ${projectPath}`);
    process.exit(1);
  }

  const stats = await migrateProject(projectPath, dryRun, createBackup);

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                     Migration Summary                          ║
╚════════════════════════════════════════════════════════════════╝

Total features:     ${stats.total}
✅ Migrated:        ${stats.migrated}
⏭️  Unchanged:       ${stats.unchanged}
❌ Errors:          ${stats.errors}
`);

  if (stats.migrations.length > 0) {
    console.log('Migration breakdown:');
    const breakdown: Record<string, number> = {};
    for (const m of stats.migrations) {
      const key = `${m.from} → ${m.to}`;
      breakdown[key] = (breakdown[key] || 0) + 1;
    }
    for (const [migration, count] of Object.entries(breakdown)) {
      console.log(`  ${migration}: ${count}`);
    }
  }

  if (dryRun) {
    console.log('\n⚠️  This was a dry run. No files were modified.');
    console.log('   Run without --dry-run to apply changes.');
  } else {
    console.log('\n✅ Migration complete!');
    if (createBackup) {
      console.log('   Backups created with .backup-<timestamp> suffix.');
    }
  }

  process.exit(stats.errors > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
