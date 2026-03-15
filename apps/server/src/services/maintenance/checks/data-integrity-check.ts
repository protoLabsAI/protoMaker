/**
 * DataIntegrityCheck - Monitors feature directory counts for catastrophic data loss.
 *
 * Delegates to DataIntegrityWatchdogService.checkIntegrity() which tracks the number
 * of feature directories over time and alerts when a significant drop is detected
 * (default threshold: 50% reduction).
 *
 * No auto-fix. A data integrity breach requires operator investigation.
 */

import { createLogger } from '@protolabsai/utils';
import type { DataIntegrityWatchdogService } from '../../data-integrity-watchdog-service.js';
import type { MaintenanceCheck, MaintenanceIssue } from '../types.js';

const logger = createLogger('DataIntegrityCheck');

export class DataIntegrityCheck implements MaintenanceCheck {
  readonly id = 'data-integrity';

  constructor(private readonly watchdogService: DataIntegrityWatchdogService) {}

  async run(projectPath: string): Promise<MaintenanceIssue[]> {
    try {
      const result = await this.watchdogService.checkIntegrity(projectPath);

      if (result.intact) {
        return [];
      }

      const dropPct = Math.round(result.dropPercentage);
      return [
        {
          checkId: this.id,
          severity: 'critical',
          message: `Data integrity breach in ${projectPath}: feature count dropped from ${result.lastKnownCount} to ${result.currentCount} (${dropPct}% drop)`,
          autoFixable: false,
          context: {
            projectPath,
            currentCount: result.currentCount,
            lastKnownCount: result.lastKnownCount,
            dropPercentage: result.dropPercentage,
            errorMessage: result.errorMessage,
          },
        },
      ];
    } catch (error) {
      logger.warn(`DataIntegrityCheck failed for ${projectPath}:`, error);
      return [];
    }
  }
}
