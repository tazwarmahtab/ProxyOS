'use client';

import { useState } from 'react';
import { useTTS, DEFAULT_VOICES } from '../lib/tts/useTTS';

interface TTSPlayerProps {
  defaultVoice?: string;
  placeholder?: string;
  className?: string;
}

export function TTSPlayer({
  defaultVoice = 'leah',
  placeholder = 'Enter text to speak...',
  className = '',
}: TTSPlayerProps) {
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState(defaultVoice);
  
  const { speak, stop, isSpeaking, isLoading, error } = useTTS({
    voice: selectedVoice,
    autoPlay: true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      speak(text);
    }
  };

  return (
    <div className={`tts-player ${className}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="voice" className="block text-sm font-medium mb-1">
            Voice
          </label>
          <select
            id="voice"
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            className="w-full p-2 border rounded-md bg-background"
            disabled={isSpeaking || isLoading}
          >
            {DEFAULT_VOICES.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name} - {voice.description}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="text" className="block text-sm font-medium mb-1">
            Text to Speak
          </label>
          <textarea
            id="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            className="w-full p-2 border rounded-md bg-background min-h-[100px]"
            disabled={isSpeaking || isLoading}
            maxLength={5000}
          />
          <p className="text-xs text-muted-foreground mt-1">
            {text.length}/5000 characters
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!text.trim() || isSpeaking || isLoading}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Generating...' : isSpeaking ? 'Speaking...' : 'Speak'}
          </button>
          
          {isSpeaking && (
            <button
              type="button"
              onClick={stop}
              className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md"
            >
              Stop
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
