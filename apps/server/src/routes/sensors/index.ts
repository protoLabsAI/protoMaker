/**
 * Sensor Registry API Routes
 *
 * - POST /api/sensors/register — Register a new sensor (or re-register an existing one)
 * - POST /api/sensors/report   — Report a sensor reading (requires API key auth)
 * - GET  /api/sensors          — List all registered sensors
 * - GET  /api/sensors/:id      — Get a single sensor by id
 */

import { Router } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import type { SensorRegistryService } from '../../services/sensor-registry-service.js';

const logger = createLogger('SensorRoutes');

export function createSensorRoutes(sensorRegistryService: SensorRegistryService): Router {
  const router = Router();

  /**
   * POST /api/sensors/register
   * Register a sensor or re-register it after a restart.
   * Body: { id: string; name: string; description?: string }
   */
  router.post('/register', (req, res) => {
    try {
      const { id, name, description } = req.body as {
        id?: string;
        name?: string;
        description?: string;
      };

      const result = sensorRegistryService.register({
        id: id ?? '',
        name: name ?? '',
        description,
      });

      if (!result.success) {
        res.status(400).json({ success: false, error: result.error });
        return;
      }

      logger.info(`Sensor registered via API: "${result.sensor?.id}"`);
      res.status(201).json({ success: true, sensor: result.sensor });
    } catch (error) {
      logger.error('Failed to register sensor:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to register sensor',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /api/sensors/report
   * Report a data reading from a registered sensor. Requires API key authentication
   * (handled by the global authMiddleware applied in routes.ts).
   * Body: { sensorId: string; data: Record<string, unknown> }
   */
  router.post('/report', (req, res) => {
    try {
      const { sensorId, data } = req.body as {
        sensorId?: string;
        data?: Record<string, unknown>;
      };

      if (!sensorId || typeof sensorId !== 'string') {
        res.status(400).json({ success: false, error: 'sensorId is required' });
        return;
      }

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        res.status(400).json({ success: false, error: 'data must be a non-array object' });
        return;
      }

      const result = sensorRegistryService.report({ sensorId, data });

      if (!result.success) {
        res.status(404).json({ success: false, error: result.error });
        return;
      }

      res.json({ success: true, reading: result.reading });
    } catch (error) {
      logger.error('Failed to report sensor data:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to report sensor data',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/sensors
   * List all registered sensors with their latest readings and computed state.
   */
  router.get('/', (_req, res) => {
    try {
      const sensors = sensorRegistryService.getAll();
      res.json({ success: true, sensors, total: sensors.length });
    } catch (error) {
      logger.error('Failed to list sensors:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list sensors',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/sensors/:id
   * Get a single sensor by id.
   */
  router.get('/:id', (req, res) => {
    try {
      const { id } = req.params;
      const entry = sensorRegistryService.get(id);

      if (!entry) {
        res.status(404).json({ success: false, error: `Sensor "${id}" not found` });
        return;
      }

      res.json({ success: true, ...entry });
    } catch (error) {
      logger.error('Failed to get sensor:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get sensor',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
