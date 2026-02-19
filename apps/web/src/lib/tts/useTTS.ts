'use client';

import { useState, useCallback, useRef } from 'react';

export interface UseTTSOptions {
  voice?: string;
  autoPlay?: boolean;
}

export interface UseTTSReturn {
  speak: (text: string) => Promise<void>;
  stop: () => void;
  isSpeaking: boolean;
  isLoading: boolean;
  error: string | null;
  audioUrl: string | null;
}

export function useTTS(options: UseTTSOptions = {}): UseTTSReturn {
  const { voice = 'leah', autoPlay = true } = options;
  
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) {
      setError('Text is required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, voice }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate speech');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);

      if (autoPlay) {
        if (audioRef.current) {
          audioRef.current.pause();
          URL.revokeObjectURL(audioRef.current.src);
        }

        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onended = () => {
          setIsSpeaking(false);
        };

        audio.onerror = () => {
          setError('Failed to play audio');
          setIsSpeaking(false);
        };

        await audio.play();
        setIsSpeaking(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [voice, autoPlay]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  return {
    speak,
    stop,
    isSpeaking,
    isLoading,
    error,
    audioUrl,
  };
}

export const DEFAULT_VOICES = [
  { id: 'leah', name: 'Leah', description: 'Natural, friendly female voice' },
  { id: 'morgan', name: 'Morgan', description: 'Professional male voice' },
  { id: 'emily', name: 'Emily', description: 'Warm female voice' },
  { id: 'daniel', name: 'Daniel', description: 'Clear male voice' },
];
