export interface MetricValue {
  value: number;
  unit: string;
  trend?: 'improving' | 'stable' | 'degrading';
  threshold?: { warning: number; critical: number };
}

export interface DoraMetrics {
  leadTime: MetricValue;
  deploymentFrequency: MetricValue;
  changeFailureRate: MetricValue;
  recoveryTime: MetricValue;
  reworkRate: MetricValue;
  computedAt: string;
  timeWindowDays: number;
}

export interface DoraRegulationAlert {
  metric: keyof Omit<DoraMetrics, 'computedAt' | 'timeWindowDays'>;
  severity: 'warning' | 'critical';
  message: string;
  currentValue: number;
  thresholdValue: number;
}
