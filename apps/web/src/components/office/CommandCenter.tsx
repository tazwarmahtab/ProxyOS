'use client';

import { useState, useRef, useEffect } from 'react';
import { feedContext } from '@/lib/api';
import type { ProxyStats } from '@/hooks/useProxyStats';

interface CommandCenterProps {
  stats: ProxyStats | null;
  onTaskSubmitted?: () => void;
}

export function CommandCenter({ stats, onTaskSubmitted }: CommandCenterProps) {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      const SpeechRecognition =
        (window as any).webkitSpeechRecognition ||
        (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput((prev) => prev + ' ' + transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = () => {
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const handleVoiceInput = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition not supported in this browser');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await feedContext({
        raw_input: input.trim(),
        input_type: 'text',
      });
      setInput('');
      onTaskSubmitted?.();
    } catch (err) {
      console.error('Failed to submit context:', err);
      alert('Failed to submit. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const energyLevel = stats?.energy_level || 0;
  const energyPercentage = Math.min(100, Math.max(0, energyLevel));

  return (
    <div className="glass-strong w-full max-w-2xl rounded-2xl border border-white/10 p-4 shadow-xl">
      <form onSubmit={handleSubmit} className="flex items-end gap-3">
        {/* Energy Ring */}
        <div className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center">
          <svg className="h-12 w-12 -rotate-90 transform">
            <circle
              cx="24"
              cy="24"
              r="20"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
              className="text-text-tertiary/20"
            />
            <circle
              cx="24"
              cy="24"
              r="20"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
              strokeDasharray={`${2 * Math.PI * 20}`}
              strokeDashoffset={`${2 * Math.PI * 20 * (1 - energyPercentage / 100)}`}
              className="text-accent-primary transition-all duration-300"
            />
          </svg>
          <span className="absolute text-xs font-medium">{energyLevel}</span>
        </div>

        {/* Input */}
        <div className="flex-1">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Feed context to your Proxy... (or use voice)"
            className="w-full rounded-lg bg-bg-secondary px-4 py-3 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary"
            minLength={3}
            maxLength={500}
            disabled={isSubmitting}
          />
        </div>

        {/* Voice Button */}
        <button
          type="button"
          onClick={handleVoiceInput}
          disabled={!recognitionRef.current || isSubmitting}
          className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${
            isListening
              ? 'bg-accent-error text-white animate-glow'
              : 'bg-bg-secondary hover:bg-bg-elevated'
          }`}
          aria-label="Voice input"
        >
          🎤
        </button>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!input.trim() || isSubmitting}
          className="flex h-12 flex-shrink-0 items-center rounded-lg bg-accent-primary px-6 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isSubmitting ? 'Sending...' : 'Deploy'}
        </button>
      </form>
    </div>
  );
}
