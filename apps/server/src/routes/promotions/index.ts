/**
 * Promotions routes — public API surface
 *
 * Re-exports the router factory so index.ts can mount it cleanly:
 *
 *   import { createPromotionsRoutes } from './routes/promotions/index.js';
 *   app.use('/api/promotions', createPromotionsRoutes());
 */

export { createPromotionsRouter as createPromotionsRoutes } from './routes.js';
