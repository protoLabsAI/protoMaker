/**
 * VAD Manager — Voice Activity Detection using @ricky0123/vad-web
 *
 * Singleton wrapping Silero VAD for browser/Electron renderer.
 * Detects speech segments and emits Float32Array PCM (16kHz mono).
 */

import { MicVAD, type RealTimeVADOptions } from '@ricky0123/vad-web';

export interface VADManagerOptions {
  /** VAD sensitivity threshold (0.0 - 1.0). Higher = more sensitive. Default: 0.5 */
  sensitivity?: number;
  /** Specific audio input device ID. Empty string = system default. */
  deviceId?: string;
  /** Called when a speech segment ends. Float32Array is 16kHz mono PCM. */
  onSpeechEnd: (audio: Float32Array) => void;
  /** Called when speech starts. */
  onSpeechStart?: () => void;
}

let instance: VADManagerInstance | null = null;

class VADManagerInstance {
  private vad: MicVAD | null = null;
  private running = false;

  get isRunning(): boolean {
    return this.running;
  }

  async start(options: VADManagerOptions): Promise<void> {
    if (this.running) {
      await this.stop();
    }

    const sensitivity = options.sensitivity ?? 0.5;

    const vadOptions: Partial<RealTimeVADOptions> = {
      positiveSpeechThreshold: sensitivity,
      negativeSpeechThreshold: Math.max(0.01, sensitivity - 0.15),
      redemptionMs: 300,
      preSpeechPadMs: 200,
      minSpeechMs: 150,
      onSpeechEnd: (audio: Float32Array) => {
        options.onSpeechEnd(audio);
      },
      onSpeechStart: () => {
        options.onSpeechStart?.();
      },
    };

    // Add device constraint via custom getStream
    if (options.deviceId) {
      const deviceId = options.deviceId;
      vadOptions.getStream = () =>
        navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId } },
        });
    }

    this.vad = await MicVAD.new(vadOptions);
    this.vad.start();
    this.running = true;
  }

  async stop(): Promise<void> {
    if (this.vad) {
      await this.vad.pause();
      await this.vad.destroy();
      this.vad = null;
    }
    this.running = false;
  }
}

/**
 * Get the singleton VAD manager instance.
 */
export function getVADManager(): VADManagerInstance {
  if (!instance) {
    instance = new VADManagerInstance();
  }
  return instance;
}
