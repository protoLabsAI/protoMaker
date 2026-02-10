/**
 * Ava Gateway routes - HTTP API for Ava Gateway status
 */

import { Router } from 'express';
import type { AvaGatewayService } from '../../services/ava-gateway-service.js';
import { createStatusHandler } from './routes/status.js';

export function createAvaRoutes(avaGatewayService: AvaGatewayService): Router {
  const router = Router();

  router.get('/status', createStatusHandler(avaGatewayService));

  return router;
}
