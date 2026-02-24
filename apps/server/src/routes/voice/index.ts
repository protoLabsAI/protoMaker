/**
 * Voice routes - HTTP API for voice activation and transcription
 *
 * Provides endpoints for:
 * - POST /api/voice/transcribe - Transcribe PCM audio with wake word detection
 * - GET /api/voice/models - List available whisper models and download status
 * - POST /api/voice/models/download - Download a whisper model
 */

import { Router, type Request, type Response } from 'express';
import type { VoiceService } from '../../services/voice-service.js';
import type { EventEmitter } from '../../lib/events.js';
import { createLogger } from '@automaker/utils';
import type { WhisperModelSize } from '@automaker/types';

const logger = createLogger('VoiceRoutes');

/**
 * Create Voice router with all endpoints
 */
export function createVoiceRoutes(voiceService: VoiceService, _events: EventEmitter): Router {
  const router = Router();

  /**
   * POST /api/voice/transcribe
   * Body: application/octet-stream (PCM Float32, 16kHz mono)
   * Response: { text, isWakeWord, command? }
   */
  router.post('/transcribe', async (req: Request, res: Response) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const buffer = Buffer.concat(chunks);

      if (buffer.length === 0) {
        res.status(400).json({ error: 'Empty audio data' });
        return;
      }

      // Convert Buffer to Float32Array (PCM data from VAD is already Float32)
      const float32 = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);

      const result = await voiceService.transcribe(float32);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transcription failed';
      logger.error(`Transcription error: ${message}`);
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/voice/models
   * Response: { models: [{ size, downloaded, bytes, expectedBytes }] }
   */
  router.get('/models', (_req: Request, res: Response) => {
    try {
      const models = voiceService.getModelStatus();
      res.json({ models });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get model status';
      logger.error(`Model status error: ${message}`);
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/voice/models/download
   * Body: { size: "tiny" | "base" | "small" }
   * Response: { success, path } (+ WebSocket progress events)
   */
  router.post('/models/download', async (req: Request, res: Response) => {
    try {
      const { size } = req.body as { size?: WhisperModelSize };

      if (!size || !['tiny', 'base', 'small'].includes(size)) {
        res.status(400).json({ error: 'Invalid model size. Must be "tiny", "base", or "small".' });
        return;
      }

      const path = await voiceService.downloadModel(size);
      res.json({ success: true, path });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Download failed';
      logger.error(`Model download error: ${message}`);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
