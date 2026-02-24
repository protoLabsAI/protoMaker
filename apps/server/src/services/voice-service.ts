/**
 * VoiceService — Local speech-to-text using whisper.cpp via @napi-rs/whisper
 *
 * Handles:
 * - Lazy model loading (downloaded on first use)
 * - PCM Float32 transcription
 * - Wake word matching
 * - Model download with progress events
 */

import { existsSync, mkdirSync, createWriteStream, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { Whisper, WhisperFullParams, WhisperSamplingStrategy } from '@napi-rs/whisper';
import { createLogger } from '@protolabs-ai/utils';
import type { EventEmitter } from '../lib/events.js';
import type { SettingsService } from './settings-service.js';
import type { WhisperModelSize } from '@protolabs-ai/types';

const logger = createLogger('VoiceService');

const MODEL_URLS: Record<WhisperModelSize, string> = {
  tiny: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
  base: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
  small: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',
};

const MODEL_SIZES: Record<WhisperModelSize, number> = {
  tiny: 75_000_000,
  base: 145_000_000,
  small: 470_000_000,
};

interface TranscriptionResult {
  text: string;
  isWakeWord: boolean;
  command?: string;
}

interface ModelStatus {
  size: WhisperModelSize;
  downloaded: boolean;
  bytes: number;
  expectedBytes: number;
}

export class VoiceService {
  private whisper: Whisper | null = null;
  private loadedModel: WhisperModelSize | null = null;
  private modelsDir: string;
  private events: EventEmitter;
  private settingsService: SettingsService;
  private loading = false;

  constructor(events: EventEmitter, settingsService: SettingsService, modelsDir: string) {
    this.events = events;
    this.settingsService = settingsService;
    this.modelsDir = modelsDir;

    if (!existsSync(this.modelsDir)) {
      mkdirSync(this.modelsDir, { recursive: true });
    }
  }

  private modelPath(size: WhisperModelSize): string {
    return join(this.modelsDir, `ggml-${size}.en.bin`);
  }

  /**
   * Ensure the specified model is loaded. Downloads if needed.
   */
  async ensureModel(size: WhisperModelSize): Promise<void> {
    if (this.loadedModel === size && this.whisper) {
      return;
    }

    const modelFile = this.modelPath(size);

    if (!existsSync(modelFile)) {
      throw new Error(`Model "${size}" not downloaded. Call downloadModel first.`);
    }

    if (this.loading) {
      throw new Error('Model is already being loaded');
    }

    this.loading = true;
    try {
      logger.info(`Loading whisper model: ${size}`);
      const modelData = await readFile(modelFile);
      this.whisper = new Whisper(modelData, { useGpu: true });
      this.loadedModel = size;
      logger.info(`Whisper model "${size}" loaded successfully`);
    } finally {
      this.loading = false;
    }
  }

  /**
   * Transcribe PCM Float32 audio (16kHz mono).
   */
  async transcribe(pcmData: Float32Array): Promise<TranscriptionResult> {
    const settings = await this.settingsService.getGlobalSettings();
    const voiceSettings = settings.voice;
    const modelSize = voiceSettings?.modelSize ?? 'tiny';
    const wakeWord = voiceSettings?.wakeWord ?? 'ava';

    await this.ensureModel(modelSize);

    if (!this.whisper) {
      throw new Error('Whisper model not loaded');
    }

    const params = new WhisperFullParams(WhisperSamplingStrategy.Greedy);
    params.language = 'en';
    params.noTimestamps = true;
    params.singleSegment = true;
    params.printProgress = false;
    params.printRealtime = false;
    params.printTimestamps = false;
    params.printSpecial = false;
    params.suppressBlank = true;
    params.suppressNonSpeechTokens = true;

    const text = this.whisper.full(params, pcmData).trim();

    logger.debug(`Transcription: "${text}"`);

    this.events.emit('voice:transcription', { text });

    const isWakeWord = this.matchesWakeWord(text, wakeWord);
    let command: string | undefined;

    if (isWakeWord) {
      // Extract command after wake word
      const lower = text.toLowerCase();
      const wakeIdx = lower.indexOf(wakeWord.toLowerCase());
      if (wakeIdx !== -1) {
        const afterWake = text.slice(wakeIdx + wakeWord.length).trim();
        // Strip common filler: "," "." leading punctuation
        command = afterWake.replace(/^[,.\s!?]+/, '').trim() || undefined;
      }

      this.events.emit('voice:wake-word-detected', { text, command });

      if (command) {
        this.events.emit('voice:command-received', { text, command });
      }
    }

    return { text, isWakeWord, command };
  }

  /**
   * Check if transcribed text contains the wake word.
   * Case-insensitive, checks if wake word appears anywhere in text.
   */
  matchesWakeWord(text: string, wakeWord: string): boolean {
    return text.toLowerCase().includes(wakeWord.toLowerCase());
  }

  /**
   * Download a whisper model from HuggingFace with progress events.
   */
  async downloadModel(size: WhisperModelSize): Promise<string> {
    const modelFile = this.modelPath(size);

    if (existsSync(modelFile)) {
      const stat = statSync(modelFile);
      if (stat.size > 1_000_000) {
        logger.info(`Model "${size}" already downloaded at ${modelFile}`);
        return modelFile;
      }
    }

    const url = MODEL_URLS[size];
    logger.info(`Downloading whisper model "${size}" from ${url}`);

    this.events.emit('voice:model-download-progress', {
      size,
      downloaded: 0,
      total: MODEL_SIZES[size],
      percent: 0,
    });

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download model: ${response.status} ${response.statusText}`);
    }

    const totalBytes =
      parseInt(response.headers.get('content-length') || '0', 10) || MODEL_SIZES[size];
    let downloadedBytes = 0;

    const body = response.body;
    if (!body) {
      throw new Error('No response body');
    }

    const nodeStream = Readable.fromWeb(body as import('stream/web').ReadableStream);
    const fileStream = createWriteStream(modelFile);

    // Track progress
    nodeStream.on('data', (chunk: Buffer) => {
      downloadedBytes += chunk.length;
      const percent = Math.round((downloadedBytes / totalBytes) * 100);
      this.events.emit('voice:model-download-progress', {
        size,
        downloaded: downloadedBytes,
        total: totalBytes,
        percent,
      });
    });

    await pipeline(nodeStream, fileStream);

    logger.info(`Model "${size}" downloaded to ${modelFile} (${downloadedBytes} bytes)`);

    this.events.emit('voice:model-download-progress', {
      size,
      downloaded: downloadedBytes,
      total: totalBytes,
      percent: 100,
    });

    return modelFile;
  }

  /**
   * Get status of all available models.
   */
  getModelStatus(): ModelStatus[] {
    const sizes: WhisperModelSize[] = ['tiny', 'base', 'small'];
    return sizes.map((size) => {
      const modelFile = this.modelPath(size);
      const downloaded = existsSync(modelFile);
      const bytes = downloaded ? statSync(modelFile).size : 0;
      return {
        size,
        downloaded,
        bytes,
        expectedBytes: MODEL_SIZES[size],
      };
    });
  }
}
