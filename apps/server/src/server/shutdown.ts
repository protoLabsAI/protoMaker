// Graceful shutdown: broadcast server:shutdown event and tear down all services

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type * as http from 'node:http';
import { createLogger } from '@protolabsai/utils';

import type { ServiceContainer } from './services.js';
import { getTerminalService } from '../services/terminal-service.js';
import { shutdownLangfuse } from '../lib/langfuse-singleton.js';
import { shutdownOtel } from '../lib/otel.js';
import { getReactiveSpawnerService } from '../services/reactive-spawner-service.js';

const logger = createLogger('Server:Shutdown');

/**
 * Perform graceful shutdown: notify WebSocket clients, write clean-shutdown marker,
 * stop all services, and close the HTTP server.
 */
async function gracefulShutdown(server: http.Server, services: ServiceContainer): Promise<void> {
  logger.info('Shutting down gracefully...');

  const {
    events,
    driftCheckInterval,
    leadEngineerService,
    pipelineOrchestrator,
    autoModeService,
    healthMonitorService,
    schedulerService,
    worktreeLifecycleService,
    issueCreationService,
    hitlFormService,
    actionableItemBridge,
    agentDiscordRouter,
    crdtSyncService,
    dataDir,
  } = services;

  const terminalService = getTerminalService();

  // Notify all connected WebSocket clients before shutting down
  try {
    events.emit('server:shutdown', { timestamp: new Date().toISOString() });
    // Give clients a moment to receive the notification
    await new Promise((resolve) => setTimeout(resolve, 200));
  } catch (err) {
    logger.warn('[SHUTDOWN] Failed to broadcast shutdown notification:', err);
  }

  // Write clean shutdown marker so next startup knows this wasn't a crash
  try {
    await writeFile(join(dataDir, '.clean-shutdown'), Date.now().toString());
  } catch (err) {
    logger.warn('[SHUTDOWN] Failed to write clean shutdown marker:', err);
  }

  if (driftCheckInterval) {
    clearInterval(driftCheckInterval);
  }
  leadEngineerService.destroy();
  pipelineOrchestrator.destroy();
  await autoModeService.shutdown();
  healthMonitorService.stopMonitoring();
  schedulerService.stop();
  terminalService.cleanup();
  worktreeLifecycleService.shutdown();
  issueCreationService.shutdown();
  hitlFormService.shutdown();
  actionableItemBridge.shutdown();
  agentDiscordRouter.stop();
  // Shut down Ava Channel Reactor
  if (services._avaChannelReactorStop) {
    try {
      services._avaChannelReactorStop();
    } catch (err) {
      logger.warn('[SHUTDOWN] Ava Channel Reactor stop failed:', err);
    }
  }
  // Shut down CRDT document store (closes Automerge sync server + flushes)
  if (services._crdtStoreCleanup) {
    try {
      await services._crdtStoreCleanup();
    } catch (err) {
      logger.warn('[SHUTDOWN] CRDT store cleanup failed:', err);
    }
  }
  await crdtSyncService.shutdown();
  await shutdownLangfuse();
  await shutdownOtel();

  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
}

/**
 * Register SIGTERM and SIGINT signal handlers for graceful shutdown.
 */
export function setupShutdown(server: http.Server, services: ServiceContainer): void {
  // Signal handlers stay sync, call async gracefulShutdown
  process.on('SIGTERM', () => {
    gracefulShutdown(server, services).catch((err) => {
      logger.error('Shutdown failed:', err);
      process.exit(1);
    });
  });

  process.on('SIGINT', () => {
    gracefulShutdown(server, services).catch((err) => {
      logger.error('Shutdown failed:', err);
      process.exit(1);
    });
  });

  // Global error handlers to prevent crashes from uncaught errors
  process.on('unhandledRejection', (reason: unknown, _promise: Promise<unknown>) => {
    logger.error('Unhandled Promise Rejection:', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
    // Don't exit - log the error and continue running
  });

  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception:', {
      message: error.message,
      stack: error.stack,
    });

    // Known non-fatal errors: log and continue instead of crashing
    const nonFatalCodes = [
      'ECONNRESET',
      'EPIPE',
      'ERR_STREAM_DESTROYED',
      'ERR_STREAM_WRITE_AFTER_END',
    ];
    const errorCode = (error as NodeJS.ErrnoException).code;
    if (errorCode && nonFatalCodes.includes(errorCode)) {
      logger.warn(`Non-fatal uncaught exception (${errorCode}), continuing...`);
      return;
    }

    // For truly fatal exceptions: attempt graceful shutdown with timeout
    logger.error('Fatal uncaught exception — initiating graceful shutdown...');

    // Notify Ava to investigate the root cause before we shut down
    try {
      const spawner = getReactiveSpawnerService();
      spawner
        .spawnForError({
          errorType: 'uncaught_exception',
          message: error.message,
          stackTrace: error.stack,
          severity: 'critical',
        })
        .catch((spawnErr) =>
          logger.error('ReactiveSpawner: spawnForError (uncaught_exception) failed:', spawnErr)
        );
    } catch {
      // ReactiveSpawnerService may not be initialized — continue with shutdown
    }

    const forceExitTimeout = setTimeout(() => {
      logger.error('Graceful shutdown timed out after 10s, forcing exit');
      process.exit(1);
    }, 10_000);
    forceExitTimeout.unref(); // Don't keep process alive just for this timer

    gracefulShutdown(server, services)
      .catch((err) => logger.error('Shutdown failed during uncaught exception handling:', err))
      .finally(() => process.exit(1));
  });
}
