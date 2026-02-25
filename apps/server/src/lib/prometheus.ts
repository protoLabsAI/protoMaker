/**
 * Prometheus metrics instrumentation
 *
 * Provides a global metrics registry and Express middleware for HTTP request tracking.
 * All metrics are exposed at /api/metrics/prometheus in Prometheus text format.
 */

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import type { Request, Response, NextFunction } from 'express';

/**
 * Global Prometheus metrics registry
 * All custom metrics are registered here automatically when instantiated
 */
export const register = new Registry();

/**
 * Enable default Node.js metrics (heap, CPU, event loop, etc.)
 * Collected every 10 seconds
 */
collectDefaultMetrics({ register, prefix: 'nodejs_' });

/**
 * HTTP request counter by method, route, and status code
 */
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

/**
 * HTTP request duration histogram in seconds
 */
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60], // Buckets in seconds
  registers: [register],
});

/**
 * Active agents gauge (currently running AI agents)
 */
export const activeAgentsCount = new Gauge({
  name: 'active_agents_count',
  help: 'Number of currently active AI agents',
  registers: [register],
});

/**
 * Features by status gauge (tracks board state)
 */
export const featuresByStatus = new Gauge({
  name: 'features_by_status',
  help: 'Number of features by status',
  labelNames: ['status'],
  registers: [register],
});

/**
 * Agent execution duration histogram in seconds
 */
export const agentExecutionDuration = new Histogram({
  name: 'agent_execution_duration_seconds',
  help: 'Agent execution duration in seconds',
  labelNames: ['feature_id', 'complexity'],
  buckets: [60, 300, 600, 1800, 3600, 7200, 14400], // Buckets: 1m, 5m, 10m, 30m, 1h, 2h, 4h
  registers: [register],
});

/**
 * Agent cost counter in USD
 */
export const agentCostTotal = new Counter({
  name: 'agent_cost_usd_total',
  help: 'Total cost of agent executions in USD',
  labelNames: ['feature_id', 'model'],
  registers: [register],
});

/**
 * Agent input tokens counter
 */
export const agentTokensInputTotal = new Counter({
  name: 'agent_tokens_input_total',
  help: 'Total input tokens consumed by agents',
  labelNames: ['model'],
  registers: [register],
});

/**
 * Agent output tokens counter
 */
export const agentTokensOutputTotal = new Counter({
  name: 'agent_tokens_output_total',
  help: 'Total output tokens produced by agents',
  labelNames: ['model'],
  registers: [register],
});

/**
 * Agent executions counter
 */
export const agentExecutionsTotal = new Counter({
  name: 'agent_executions_total',
  help: 'Total number of agent executions',
  labelNames: ['model', 'complexity', 'success'],
  registers: [register],
});

/**
 * Node.js heap used gauge in bytes
 */
export const nodeJsHeapUsedBytes = new Gauge({
  name: 'node_js_heap_used_bytes',
  help: 'Node.js heap memory used in bytes',
  registers: [register],
});

/**
 * WebSocket connections active gauge
 */
export const websocketConnectionsActive = new Gauge({
  name: 'websocket_connections_active',
  help: 'Number of active WebSocket connections',
  registers: [register],
});

/**
 * Update heap memory usage metric
 * Should be called periodically (e.g., on each metrics scrape)
 */
export function updateHeapMetrics(): void {
  const memUsage = process.memoryUsage();
  nodeJsHeapUsedBytes.set(memUsage.heapUsed);
}

/**
 * Express middleware for HTTP request instrumentation
 *
 * Tracks request count and duration for all requests.
 * Excludes health check endpoints from metrics to avoid noise.
 */
export function prometheusMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip health checks and the metrics endpoint itself
  if (
    req.path === '/api/health' ||
    req.path.startsWith('/api/health/') ||
    req.path === '/api/metrics/prometheus'
  ) {
    next();
    return;
  }

  const start = Date.now();

  // Capture response when it finishes
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000; // Convert to seconds
    const route = req.route?.path || req.path || 'unknown';
    const method = req.method;
    const status = res.statusCode.toString();

    // Increment counter
    httpRequestsTotal.inc({ method, route, status });

    // Record duration
    httpRequestDuration.observe({ method, route, status }, duration);
  });

  next();
}
