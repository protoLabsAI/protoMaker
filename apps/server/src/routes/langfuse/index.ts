/**
 * Langfuse Routes — Proxy to Langfuse REST API
 *
 * All routes use POST (Express 5 convention). Each route proxies to
 * the corresponding Langfuse public API endpoint using Basic Auth
 * (publicKey:secretKey).
 */

import { Router } from 'express';
import { createLogger } from '@automaker/utils';

const logger = createLogger('LangfuseRoutes');

/**
 * Build Basic Auth header for Langfuse API.
 * Returns null if credentials are missing.
 */
function getLangfuseAuth(): { baseUrl: string; headers: Record<string, string> } | null {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL;

  if (!publicKey || !secretKey || !baseUrl) {
    return null;
  }

  const credentials = Buffer.from(`${publicKey}:${secretKey}`).toString('base64');
  return {
    baseUrl,
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
  };
}

/**
 * Generic proxy helper — forwards to Langfuse API and returns the response.
 */
async function langfuseProxy(
  method: 'GET' | 'POST',
  path: string,
  queryParams?: Record<string, string | number | undefined>,
  body?: unknown
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const auth = getLangfuseAuth();
  if (!auth) {
    return { ok: false, status: 503, data: { error: 'Langfuse not configured' } };
  }

  const url = new URL(`${auth.baseUrl}${path}`);
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const options: RequestInit = {
    method,
    headers: auth.headers,
  };
  if (method === 'POST' && body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url.toString(), options);
  const data = await response.json().catch(() => ({ error: 'Failed to parse response' }));

  return { ok: response.ok, status: response.status, data };
}

export function createLangfuseRoutes(): Router {
  const router = Router();

  /**
   * POST /api/langfuse/traces
   * List traces with optional filters.
   * Body: { page?, limit?, name?, tags?, userId?, sessionId?, fromTimestamp?, toTimestamp? }
   */
  router.post('/traces', async (req, res) => {
    try {
      const { page, limit, name, tags, userId, sessionId, fromTimestamp, toTimestamp } = req.body;

      const queryParams: Record<string, string | number | undefined> = {
        page: page ?? 1,
        limit: limit ?? 20,
      };
      if (name) queryParams.name = name;
      if (userId) queryParams.userId = userId;
      if (sessionId) queryParams.sessionId = sessionId;
      if (fromTimestamp) queryParams.fromTimestamp = fromTimestamp;
      if (toTimestamp) queryParams.toTimestamp = toTimestamp;

      // Tags are passed as repeated query params
      let path = '/api/public/traces';
      if (tags && Array.isArray(tags) && tags.length > 0) {
        const tagParams = tags.map((t: string) => `tags=${encodeURIComponent(t)}`).join('&');
        path += `?${tagParams}`;
      }

      const result = await langfuseProxy('GET', path, queryParams);
      res.status(result.status).json(result.data);
    } catch (error) {
      logger.error('Failed to list traces:', error);
      res.status(500).json({ error: 'Failed to list traces' });
    }
  });

  /**
   * POST /api/langfuse/traces/detail
   * Get a single trace with all observations.
   * Body: { traceId }
   */
  router.post('/traces/detail', async (req, res) => {
    try {
      const { traceId } = req.body;
      if (!traceId) {
        res.status(400).json({ error: 'traceId is required' });
        return;
      }

      const result = await langfuseProxy('GET', `/api/public/traces/${traceId}`);
      res.status(result.status).json(result.data);
    } catch (error) {
      logger.error('Failed to get trace detail:', error);
      res.status(500).json({ error: 'Failed to get trace detail' });
    }
  });

  /**
   * POST /api/langfuse/costs
   * Get observations for cost aggregation.
   * Body: { page?, limit?, name?, type?, model?, fromStartTime?, toStartTime? }
   */
  router.post('/costs', async (req, res) => {
    try {
      const { page, limit, name, type, model, fromStartTime, toStartTime } = req.body;

      const result = await langfuseProxy('GET', '/api/public/observations', {
        page: page ?? 1,
        limit: limit ?? 50,
        name,
        type: type ?? 'GENERATION',
        model,
        fromStartTime,
        toStartTime,
      });
      res.status(result.status).json(result.data);
    } catch (error) {
      logger.error('Failed to get costs:', error);
      res.status(500).json({ error: 'Failed to get costs' });
    }
  });

  /**
   * POST /api/langfuse/prompts
   * List all managed prompts.
   * Body: { page?, limit?, name?, label? }
   */
  router.post('/prompts', async (req, res) => {
    try {
      const { page, limit, name, label } = req.body;

      const result = await langfuseProxy('GET', '/api/public/v2/prompts', {
        page: page ?? 1,
        limit: limit ?? 50,
        name,
        label,
      });
      res.status(result.status).json(result.data);
    } catch (error) {
      logger.error('Failed to list prompts:', error);
      res.status(500).json({ error: 'Failed to list prompts' });
    }
  });

  /**
   * POST /api/langfuse/scores
   * Create a score on a trace.
   * Body: { traceId, name, value, comment? }
   */
  router.post('/scores', async (req, res) => {
    try {
      const { traceId, name, value, comment } = req.body;
      if (!traceId || !name || value === undefined) {
        res.status(400).json({ error: 'traceId, name, and value are required' });
        return;
      }

      const result = await langfuseProxy('POST', '/api/public/scores', undefined, {
        traceId,
        name,
        value,
        comment,
      });
      res.status(result.status).json(result.data);
    } catch (error) {
      logger.error('Failed to create score:', error);
      res.status(500).json({ error: 'Failed to create score' });
    }
  });

  /**
   * POST /api/langfuse/datasets
   * List datasets.
   * Body: { page?, limit? }
   */
  router.post('/datasets', async (req, res) => {
    try {
      const { page, limit } = req.body;

      const result = await langfuseProxy('GET', '/api/public/v2/datasets', {
        page: page ?? 1,
        limit: limit ?? 50,
      });
      res.status(result.status).json(result.data);
    } catch (error) {
      logger.error('Failed to list datasets:', error);
      res.status(500).json({ error: 'Failed to list datasets' });
    }
  });

  /**
   * POST /api/langfuse/datasets/items
   * Add a trace to a dataset. Creates dataset if it doesn't exist.
   * Body: { datasetName, traceId, observationId?, metadata? }
   */
  router.post('/datasets/items', async (req, res) => {
    try {
      const { datasetName, traceId, observationId, metadata } = req.body;
      if (!datasetName || !traceId) {
        res.status(400).json({ error: 'datasetName and traceId are required' });
        return;
      }

      // Ensure dataset exists first
      await langfuseProxy('POST', '/api/public/v2/datasets', undefined, {
        name: datasetName,
      });

      // Add item to dataset
      const result = await langfuseProxy('POST', '/api/public/dataset-items', undefined, {
        datasetName,
        sourceTraceId: traceId,
        sourceObservationId: observationId,
        metadata,
      });
      res.status(result.status).json(result.data);
    } catch (error) {
      logger.error('Failed to add dataset item:', error);
      res.status(500).json({ error: 'Failed to add dataset item' });
    }
  });

  return router;
}
