/**
 * MemoryPressureCheck - Monitors Node.js heap usage and reports high memory pressure.
 *
 * Uses v8.getHeapStatistics() to get the actual heap size limit (set by --max-old-space-size)
 * rather than process.memoryUsage().heapTotal, which V8 grows conservatively and would
 * report falsely high utilization for small usage vs large limits.
 *
 * Thresholds:
 * - warning:  >= 80% of heap limit
 * - critical: >= 95% of heap limit
 *
 * No auto-fix. Memory pressure requires operator intervention or a server restart.
 */

import v8 from 'v8';
import type { MaintenanceCheck, MaintenanceIssue } from '../types.js';

/** Heap usage fraction that triggers a warning issue. */
const MEMORY_WARNING_THRESHOLD = 0.8;

/** Heap usage fraction that escalates to critical severity. */
const MEMORY_CRITICAL_THRESHOLD = 0.95;

export class MemoryPressureCheck implements MaintenanceCheck {
  readonly id = 'memory-pressure';

  /**
   * projectPath is accepted for interface compatibility but not used —
   * memory pressure is a process-global metric.
   */
  async run(_projectPath: string): Promise<MaintenanceIssue[]> {
    const memoryUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();
    const heapLimit = heapStats.heap_size_limit;
    const heapUsagePercent = memoryUsage.heapUsed / heapLimit;

    if (heapUsagePercent < MEMORY_WARNING_THRESHOLD) {
      return [];
    }

    const heapUsedMB = Math.round(memoryUsage.heapUsed / (1024 * 1024));
    const heapLimitMB = Math.round(heapLimit / (1024 * 1024));
    const percentDisplay = Math.round(heapUsagePercent * 100);

    const severity = heapUsagePercent >= MEMORY_CRITICAL_THRESHOLD ? 'critical' : 'warning';

    return [
      {
        checkId: this.id,
        severity,
        message: `High memory usage: ${percentDisplay}% of heap used (${heapUsedMB}MB / ${heapLimitMB}MB limit)`,
        autoFixable: false,
        context: {
          heapUsed: memoryUsage.heapUsed,
          heapLimit,
          heapUsagePercent,
          heapUsedMB,
          heapLimitMB,
          external: memoryUsage.external,
          rss: memoryUsage.rss,
        },
      },
    ];
  }
}
