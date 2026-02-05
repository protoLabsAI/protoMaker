/**
 * Webhooks routes - Inbound webhook endpoints
 */

import { Router } from 'express';
import express from 'express';
import { createGitHubWebhookHandler } from './routes/github.js';

export function createWebhooksRoutes(): Router {
  const router = Router();

  // GitHub webhook endpoint with raw body parsing for signature verification
  // We need the raw body to verify the HMAC signature
  router.post(
    '/github',
    express.raw({ type: 'application/json', limit: '10mb' }),
    createGitHubWebhookHandler()
  );

  return router;
}
