/**
 * LiteLLM Gateway module — registers the gateway service with the service container.
 *
 * This module is a no-op wiring stub: the LiteLLMGatewayService is stateless and
 * does not require event subscriptions or scheduler tasks. It is registered here
 * to follow the module pattern and make the service visible in the container.
 */

import { createLogger } from '@protolabsai/utils';
import type { ServiceContainer } from '../server/services.js';

const logger = createLogger('LiteLLMGateway:Module');

export function register(_container: ServiceContainer): void {
  logger.info('LiteLLM gateway module registered');
}
