/**
 * useVoiceActivation — React hook for voice activation with wake word detection
 *
 * Flow:
 * 1. User enables voice → VAD starts listening
 * 2. Speech detected → PCM sent to server for transcription
 * 3. Wake word detected → enters command mode
 * 4. Next utterance = command text
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { getVADManager } from '@/lib/vad-manager';
import { getHttpApiClient } from '@/lib/http-api-client';

interface VoiceActivationState {
  /** Whether voice activation is turned on */
  isEnabled: boolean;
  /** VAD is actively listening for speech */
  isListening: boolean;
  /** Audio is being transcribed by whisper */
  isProcessing: boolean;
  /** Wake word was detected, next utterance is a command */
  isCommandMode: boolean;
  /** Last transcription result */
  lastTranscription: string | null;
  /** Last command extracted after wake word */
  lastCommand: string | null;
  /** Error message if something went wrong */
  error: string | null;
  /** Toggle voice activation on/off */
  toggle: () => void;
}

export function useVoiceActivation(): VoiceActivationState {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCommandMode, setIsCommandMode] = useState(false);
  const [lastTranscription, setLastTranscription] = useState<string | null>(null);
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const commandModeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSpeechEnd = useCallback(
    async (audio: Float32Array) => {
      setIsProcessing(true);
      try {
        const client = getHttpApiClient();
        const result = await client.voice.transcribe(audio.buffer as ArrayBuffer);

        if (result.text) {
          setLastTranscription(result.text);
        }

        if (result.isWakeWord) {
          setIsCommandMode(true);

          // Clear any existing timeout
          if (commandModeTimeout.current) {
            clearTimeout(commandModeTimeout.current);
          }

          if (result.command) {
            // Wake word + command in same utterance
            setLastCommand(result.command);
            setIsCommandMode(false);
          } else {
            // Wake word only — wait for next utterance (10s timeout)
            commandModeTimeout.current = setTimeout(() => {
              setIsCommandMode(false);
            }, 10000);
          }
        } else if (isCommandMode) {
          // In command mode — this utterance is the command
          setLastCommand(result.text);
          setIsCommandMode(false);
          if (commandModeTimeout.current) {
            clearTimeout(commandModeTimeout.current);
            commandModeTimeout.current = null;
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Transcription failed';
        setError(message);
      } finally {
        setIsProcessing(false);
      }
    },
    [isCommandMode]
  );

  const startListening = useCallback(async () => {
    try {
      setError(null);
      const vad = getVADManager();
      await vad.start({
        onSpeechEnd: handleSpeechEnd,
        onSpeechStart: () => {
          setError(null);
        },
      });
      setIsListening(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start voice activation';
      setError(message);
      setIsEnabled(false);
    }
  }, [handleSpeechEnd]);

  const stopListening = useCallback(async () => {
    const vad = getVADManager();
    await vad.stop();
    setIsListening(false);
    setIsCommandMode(false);
    if (commandModeTimeout.current) {
      clearTimeout(commandModeTimeout.current);
      commandModeTimeout.current = null;
    }
  }, []);

  const toggle = useCallback(() => {
    setIsEnabled((prev) => !prev);
  }, []);

  // Start/stop VAD when enabled state changes
  useEffect(() => {
    if (isEnabled) {
      startListening();
    } else {
      stopListening();
    }

    return () => {
      stopListening();
    };
  }, [isEnabled, startListening, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (commandModeTimeout.current) {
        clearTimeout(commandModeTimeout.current);
      }
    };
  }, []);

  return {
    isEnabled,
    isListening,
    isProcessing,
    isCommandMode,
    lastTranscription,
    lastCommand,
    error,
    toggle,
  };
}
