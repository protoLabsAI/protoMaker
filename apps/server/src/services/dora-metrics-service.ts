import type { Feature, DoraMetrics, DoraRegulationAlert } from '@protolabsai/types';
import { createLogger } from '@protolabsai/utils';
import type { FeatureLoader } from './feature-loader.js';
import type { DeploymentTrackerService } from './deployment-tracker-service.js';

const logger = createLogger('DoraMetricsService');

const DEFAULT_TIME_WINDOW_DAYS = 30;

interface DoraThresholds {
  changeFailureRateWarning: number;
  changeFailureRateCritical: number;
  reworkRateWarning: number;
  reworkRateCritical: number;
  leadTimeMultiplierWarning: number;
  leadTimeMultiplierCritical: number;
  recoveryTimeWarningMs: number;
  recoveryTimeCriticalMs: number;
}

const DEFAULT_THRESHOLDS: DoraThresholds = {
  changeFailureRateWarning: 0.2,
  changeFailureRateCritical: 0.4,
  reworkRateWarning: 0.3,
  reworkRateCritical: 0.5,
  leadTimeMultiplierWarning: 2,
  leadTimeMultiplierCritical: 4,
  recoveryTimeWarningMs: 60 * 60 * 1000,
  recoveryTimeCriticalMs: 4 * 60 * 60 * 1000,
};

export class DoraMetricsService {
  private featureLoader: FeatureLoader;
  private thresholds: DoraThresholds;
  private deploymentTracker?: DeploymentTrackerService;

  constructor(
    featureLoader: FeatureLoader,
    thresholds?: Partial<DoraThresholds>,
    deploymentTracker?: DeploymentTrackerService
  ) {
    this.featureLoader = featureLoader;
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    this.deploymentTracker = deploymentTracker;
  }

  async getMetrics(
    projectPath: string,
    timeWindowDays: number = DEFAULT_TIME_WINDOW_DAYS
  ): Promise<DoraMetrics> {
    const features = await this.featureLoader.getAll(projectPath);
    const cutoff = Date.now() - timeWindowDays * 24 * 60 * 60 * 1000;

    const recentFeatures = features.filter((f) => {
      const ts = f.createdAt ? new Date(f.createdAt).getTime() : 0;
      return ts >= cutoff;
    });

    const leadTime = this.computeLeadTime(recentFeatures);
    const deploymentFrequency = this.computeDeploymentFrequency(recentFeatures, timeWindowDays);
    const changeFailureRate = this.computeChangeFailureRate(recentFeatures, timeWindowDays);
    const recoveryTime = this.computeRecoveryTime(recentFeatures, timeWindowDays);
    const reworkRate = this.computeReworkRate(recentFeatures);

    const metrics: DoraMetrics = {
      leadTime: {
        value: leadTime,
        unit: 'hours',
        threshold: {
          warning: 48,
          critical: 96,
        },
      },
      deploymentFrequency: {
        value: deploymentFrequency,
        unit: 'per_day',
        threshold: {
          warning: 0.5,
          critical: 0.1,
        },
      },
      changeFailureRate: {
        value: changeFailureRate,
        unit: 'ratio',
        threshold: {
          warning: this.thresholds.changeFailureRateWarning,
          critical: this.thresholds.changeFailureRateCritical,
        },
      },
      recoveryTime: {
        value: recoveryTime,
        unit: 'hours',
        threshold: {
          warning: this.thresholds.recoveryTimeWarningMs / (60 * 60 * 1000),
          critical: this.thresholds.recoveryTimeCriticalMs / (60 * 60 * 1000),
        },
      },
      reworkRate: {
        value: reworkRate,
        unit: 'ratio',
        threshold: {
          warning: this.thresholds.reworkRateWarning,
          critical: this.thresholds.reworkRateCritical,
        },
      },
      computedAt: new Date().toISOString(),
      timeWindowDays,
    };

    const alerts = this.evaluateRegulation(metrics);
    for (const alert of alerts) {
      if (alert.severity === 'critical') {
        logger.error(`DORA ${alert.metric}: ${alert.message}`);
      } else {
        logger.warn(`DORA ${alert.metric}: ${alert.message}`);
      }
    }

    return metrics;
  }

  evaluateRegulation(metrics: DoraMetrics): DoraRegulationAlert[] {
    const alerts: DoraRegulationAlert[] = [];

    const check = (
      metric: DoraRegulationAlert['metric'],
      value: number,
      warning: number,
      critical: number,
      higherIsBad: boolean
    ) => {
      const isCritical = higherIsBad ? value >= critical : value <= critical;
      const isWarning = higherIsBad ? value >= warning : value <= warning;

      if (isCritical) {
        alerts.push({
          metric,
          severity: 'critical',
          message: `${metric} is at ${value.toFixed(3)} (critical threshold: ${critical})`,
          currentValue: value,
          thresholdValue: critical,
        });
      } else if (isWarning) {
        alerts.push({
          metric,
          severity: 'warning',
          message: `${metric} is at ${value.toFixed(3)} (warning threshold: ${warning})`,
          currentValue: value,
          thresholdValue: warning,
        });
      }
    };

    check(
      'changeFailureRate',
      metrics.changeFailureRate.value,
      this.thresholds.changeFailureRateWarning,
      this.thresholds.changeFailureRateCritical,
      true
    );

    check(
      'reworkRate',
      metrics.reworkRate.value,
      this.thresholds.reworkRateWarning,
      this.thresholds.reworkRateCritical,
      true
    );

    check(
      'recoveryTime',
      metrics.recoveryTime.value,
      this.thresholds.recoveryTimeWarningMs / (60 * 60 * 1000),
      this.thresholds.recoveryTimeCriticalMs / (60 * 60 * 1000),
      true
    );

    if (metrics.leadTime.value > 0 && metrics.leadTime.threshold) {
      check(
        'leadTime',
        metrics.leadTime.value,
        metrics.leadTime.threshold.warning,
        metrics.leadTime.threshold.critical,
        true
      );
    }

    return alerts;
  }

  private computeLeadTime(features: Feature[]): number {
    const durations: number[] = [];

    for (const f of features) {
      if (f.status !== 'done' || !f.createdAt || !f.completedAt) continue;
      const start = new Date(f.createdAt).getTime();
      const end = new Date(f.completedAt).getTime();
      if (end > start) {
        durations.push(end - start);
      }
    }

    if (durations.length === 0) return 0;

    const avgMs = durations.reduce((a, b) => a + b, 0) / durations.length;
    return Number((avgMs / (60 * 60 * 1000)).toFixed(2));
  }

  /**
   * Deployment frequency: when real deployment data exists, use actual production
   * deployments per day. Falls back to feature completion rate.
   */
  private computeDeploymentFrequency(features: Feature[], timeWindowDays: number): number {
    if (this.deploymentTracker) {
      const stats = this.deploymentTracker.getStats(timeWindowDays);
      // Use real production deploys if any exist
      const prodDeploys = this.deploymentTracker.getDeployments({
        environment: 'production',
        since: new Date(Date.now() - timeWindowDays * 24 * 60 * 60 * 1000).toISOString(),
      });
      const succeededProd = prodDeploys.filter((d) => d.status === 'succeeded');
      if (succeededProd.length > 0 && timeWindowDays > 0) {
        return Number((succeededProd.length / timeWindowDays).toFixed(3));
      }
      // Fall back to all succeeded deploys (including staging)
      if (stats.succeeded > 0 && timeWindowDays > 0) {
        return Number((stats.succeeded / timeWindowDays).toFixed(3));
      }
    }

    // Feature-based fallback
    const completed = features.filter((f) => f.status === 'done' && f.completedAt);
    if (completed.length === 0 || timeWindowDays === 0) return 0;
    return Number((completed.length / timeWindowDays).toFixed(3));
  }

  /**
   * Change failure rate: when real deployment data exists, use
   * (failed + rolled_back) / total_completed. Falls back to feature-based.
   */
  private computeChangeFailureRate(features: Feature[], timeWindowDays: number = 30): number {
    if (this.deploymentTracker) {
      const stats = this.deploymentTracker.getStats(timeWindowDays);
      const total = stats.succeeded + stats.failed + stats.rolledBack;
      if (total > 0) {
        return Number(((stats.failed + stats.rolledBack) / total).toFixed(3));
      }
    }

    // Feature-based fallback
    const completed = features.filter((f) => f.status === 'done');
    if (completed.length === 0) return 0;

    const rolledBack = features.filter(
      (f) =>
        f.status === 'blocked' &&
        f.statusHistory?.some((t) => t.from === 'done' || t.from === 'review')
    );

    return Number((rolledBack.length / completed.length).toFixed(3));
  }

  /**
   * Recovery time (MTTR): when real deployment data exists, use the time
   * from a failed deploy to the next successful deploy. Falls back to
   * feature blocked→unblocked durations.
   */
  private computeRecoveryTime(features: Feature[], timeWindowDays: number = 30): number {
    if (this.deploymentTracker) {
      const cutoff = new Date(Date.now() - timeWindowDays * 24 * 60 * 60 * 1000).toISOString();
      const deploys = this.deploymentTracker.getDeployments({ since: cutoff });

      // Walk deploys chronologically (oldest first) to find failed→succeeded pairs
      const sorted = [...deploys]
        .filter((d) => d.completedAt)
        .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

      const recoveryDurations: number[] = [];
      let lastFailedAt: number | null = null;

      for (const d of sorted) {
        if (d.status === 'failed' || d.status === 'rolled_back') {
          if (lastFailedAt === null && d.completedAt) {
            lastFailedAt = new Date(d.completedAt).getTime();
          }
        } else if (d.status === 'succeeded' && lastFailedAt !== null && d.completedAt) {
          const recoveredAt = new Date(d.completedAt).getTime();
          if (recoveredAt > lastFailedAt) {
            recoveryDurations.push(recoveredAt - lastFailedAt);
          }
          lastFailedAt = null;
        }
      }

      if (recoveryDurations.length > 0) {
        const avgMs = recoveryDurations.reduce((a, b) => a + b, 0) / recoveryDurations.length;
        return Number((avgMs / (60 * 60 * 1000)).toFixed(2));
      }
    }

    // Feature-based fallback
    const durations: number[] = [];

    for (const f of features) {
      if (!f.statusHistory) continue;

      let blockedStart: number | null = null;
      for (const transition of f.statusHistory) {
        if (transition.to === 'blocked') {
          blockedStart = new Date(transition.timestamp).getTime();
        } else if (blockedStart !== null && transition.from === 'blocked') {
          const resolved = new Date(transition.timestamp).getTime();
          if (resolved > blockedStart) {
            durations.push(resolved - blockedStart);
          }
          blockedStart = null;
        }
      }
    }

    if (durations.length === 0) return 0;

    const avgMs = durations.reduce((a, b) => a + b, 0) / durations.length;
    return Number((avgMs / (60 * 60 * 1000)).toFixed(2));
  }

  private computeReworkRate(features: Feature[]): number {
    const total = features.length;
    if (total === 0) return 0;

    const reworked = features.filter((f) => (f.failureCount ?? 0) > 0);
    return Number((reworked.length / total).toFixed(3));
  }
}
