/**
 * DiskPressureCheck — warns when the agent HOME volume is running low on space.
 *
 * The agent runs with HOME on a volume that, in some deployments, is a small
 * tmpfs (64M on the staging container). When it fills, the kernel silently
 * truncates writes to sibling files like .claude.json / .credentials.json, and
 * the Claude CLI then reports the config as "corrupted" — which masquerades as
 * an auth failure and sends operators down the wrong path (protoMaker#3564).
 *
 * This check is the early-warning signal that issue lacked: it surfaces disk
 * pressure as a 'warning' (>= warnPct) or 'critical' (>= criticalPct) issue
 * BEFORE the volume fills and corrupts config.
 *
 * No auto-fix — freeing space / enlarging the volume / moving the npm cache off
 * it is an operator (or infra) action.
 */

import { statfs } from 'node:fs/promises';
import { homedir } from 'node:os';
import { createLogger } from '@protolabsai/utils';
import type { MaintenanceCheck, MaintenanceIssue } from '../types.js';

const logger = createLogger('DiskPressureCheck');

/** Percent-full at which we emit a warning. Override via DISK_PRESSURE_WARN_PCT. */
export const DISK_PRESSURE_WARN_PCT = Number(process.env.DISK_PRESSURE_WARN_PCT ?? 80);
/** Percent-full at which the issue escalates to critical. Override via DISK_PRESSURE_CRITICAL_PCT. */
export const DISK_PRESSURE_CRITICAL_PCT = Number(process.env.DISK_PRESSURE_CRITICAL_PCT ?? 95);

/** Minimal shape of node:fs StatFs we depend on (subset, for testability). */
interface StatfsLike {
  blocks: number;
  bavail: number;
  bsize: number;
}

export class DiskPressureCheck implements MaintenanceCheck {
  readonly id = 'disk-pressure';

  constructor(
    private readonly homePathFn: () => string = () => process.env.HOME || homedir(),
    private readonly statfsFn: (path: string) => Promise<StatfsLike> = (path) =>
      statfs(path) as Promise<StatfsLike>,
    private readonly warnPct: number = DISK_PRESSURE_WARN_PCT,
    private readonly criticalPct: number = DISK_PRESSURE_CRITICAL_PCT
  ) {}

  // The HOME volume is instance-global, so the result is independent of
  // projectPath — single-project installs (the common case) see one issue.
  async run(_projectPath: string): Promise<MaintenanceIssue[]> {
    const home = this.homePathFn();

    try {
      const stat = await this.statfsFn(home);
      if (!stat.blocks || stat.blocks <= 0) {
        return [];
      }

      const usedPct = ((stat.blocks - stat.bavail) / stat.blocks) * 100;
      if (usedPct < this.warnPct) {
        return [];
      }

      const severity = usedPct >= this.criticalPct ? 'critical' : 'warning';
      const freeMb = Math.round((stat.bavail * stat.bsize) / (1024 * 1024));
      const usedRounded = Math.round(usedPct * 10) / 10;

      logger.warn(`DiskPressureCheck: ${home} is ${usedRounded}% full (${freeMb}MB free)`);

      return [
        {
          checkId: this.id,
          severity,
          message: `Agent HOME volume ${home} is ${usedRounded}% full (${freeMb}MB free). When it fills, writes to .claude.json are silently truncated and surface as bogus auth failures (protoMaker#3564). Free space, enlarge the volume, or move NPM_CONFIG_CACHE off it.`,
          autoFixable: false,
          context: {
            path: home,
            usedPct: usedRounded,
            freeMb,
            warnPct: this.warnPct,
            criticalPct: this.criticalPct,
          },
        },
      ];
    } catch (error) {
      logger.error(`DiskPressureCheck failed for ${home}:`, error);
      return [];
    }
  }
}
