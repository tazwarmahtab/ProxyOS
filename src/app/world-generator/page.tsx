'use client';

import { useState, useEffect } from 'react';
import { useSkin } from '@/hooks/useSkin';
import { supabase } from '@/lib/supabase/client';
import { IsometricOffice } from '@/components/world/IsometricOffice';
import { WorldConceptGenerator } from '@/lib/world-generator/concept';
import { GeometryReconstructor } from '@/lib/world-generator/geometry';
import type { WorldConcept } from '@/lib/world-generator/concept';
import type { OfficeGeometry } from '@/lib/world-generator/geometry';

interface GeneratedWorld {
  id: string;
  prompt: string;
  concept_image_url: string;
  geometry_config: OfficeGeometry;
  style_profile: any;
  created_at: string;
}

export default function WorldGeneratorPage() {
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [conceptImage, setConceptImage] = useState<string | null>(null);
  const [officeGeometry, setOfficeGeometry] = useState<OfficeGeometry | null>(null);
  const [generatedWorlds, setGeneratedWorlds] = useState<GeneratedWorld[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);
  const [activeWorldId, setActiveWorldId] = useState<string | null>(null);
  const { activeSkin } = useSkin();

  useEffect(() => {
    loadGeneratedWorlds();
    loadActiveWorld();
  }, []);

  async function loadGeneratedWorlds() {
    try {
      const { data, error } = await supabase
        .from('generated_worlds')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setGeneratedWorlds(data || []);
    } catch (err) {
      console.error('Failed to load worlds:', err);
    }
  }

  async function loadActiveWorld() {
    try {
      const { data, error } = await supabase
        .from('office_instances')
        .select('world_id')
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      if (data) {
        setActiveWorldId(data.world_id);
        // Load world geometry
        const { data: worldData } = await supabase
          .from('generated_worlds')
          .select('*')
          .eq('id', data.world_id)
          .single();

        if (worldData) {
          setConceptImage(worldData.concept_image_url);
          setOfficeGeometry(worldData.geometry_config);
          setSelectedWorldId(worldData.id);
        }
      }
    } catch (err) {
      console.error('Failed to load active world:', err);
    }
  }

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setGenerating(true);
    try {
      // Generate concept art
      const concept = await WorldConceptGenerator.generateConcept(prompt);
      setConceptImage(concept.imageUrl);

      // Reconstruct geometry
      const geometry = GeometryReconstructor.reconstructFromConcept(concept);
      setOfficeGeometry(geometry);

      // Save to Supabase
      const { data, error } = await supabase
        .from('generated_worlds')
        .insert({
          prompt: concept.prompt,
          concept_image_url: concept.imageUrl,
          geometry_config: geometry,
          style_profile: concept.styleProfile,
        })
        .select()
        .single();

      if (error) throw error;
      if (data) {
        setGeneratedWorlds((prev) => [data, ...prev]);
        setSelectedWorldId(data.id);
      }
    } catch (err) {
      console.error('Failed to generate world:', err);
      alert('Failed to generate world. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSelectWorld = async (world: GeneratedWorld) => {
    setSelectedWorldId(world.id);
    setConceptImage(world.concept_image_url);
    setOfficeGeometry(world.geometry_config);
  };

  const handleSetActiveWorld = async () => {
    if (!selectedWorldId) return;

    try {
      // Deactivate all other instances
      await supabase
        .from('office_instances')
        .update({ is_active: false })
        .eq('is_active', true);

      // Create or update active instance
      const { error } = await supabase
        .from('office_instances')
        .upsert(
          {
            world_id: selectedWorldId,
            is_active: true,
            agent_positions: {},
          },
          { onConflict: 'world_id' }
        );

      if (error) throw error;
      setActiveWorldId(selectedWorldId);
      alert('World set as active office!');
    } catch (err) {
      console.error('Failed to set active world:', err);
      alert('Failed to set active world');
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-bg-primary text-text-primary">
      <header className="glass-strong flex h-14 items-center justify-between border-b border-white/10 px-4">
        <h1 className="text-lg font-semibold">World Generator</h1>
        <a
          href="/"
          className="rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-white/5"
        >
          ← Back to Office
        </a>
      </header>

      <main className="flex flex-1 gap-4 overflow-hidden p-4">
        {/* Left: 3D Preview */}
        <div className="flex-1 rounded-lg glass overflow-hidden">
          {officeGeometry ? (
            <IsometricOffice
              geometry={officeGeometry}
              activeSkin={activeSkin}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-text-secondary">
              Generate a world to see preview
            </div>
          )}
        </div>

        {/* Right: Controls & Concept Art */}
        <div className="flex w-80 flex-col gap-4">
          {/* Prompt Input */}
          <div className="glass rounded-lg p-4">
            <label className="mb-2 block text-sm font-medium">
              Describe your office
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., A futuristic lab with portal technology and glowing servers..."
              className="w-full rounded-lg bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary"
              rows={4}
            />
            <button
              onClick={handleGenerate}
              disabled={generating || !prompt.trim()}
              className="mt-3 w-full rounded-lg bg-accent-primary px-4 py-2 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {generating ? 'Generating...' : 'Generate World'}
            </button>
            {selectedWorldId && (
              <button
                onClick={handleSetActiveWorld}
                disabled={selectedWorldId === activeWorldId}
                className="mt-2 w-full rounded-lg bg-accent-secondary px-4 py-2 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {selectedWorldId === activeWorldId
                  ? '✓ Active Office'
                  : 'Set as Active Office'}
              </button>
            )}
          </div>

          {/* Concept Art */}
          {conceptImage && (
            <div className="glass rounded-lg p-4">
              <h2 className="mb-2 text-sm font-medium">Concept Art</h2>
              <img
                src={conceptImage}
                alt="Generated concept"
                className="w-full rounded-lg"
              />
            </div>
          )}

          {/* Generated Worlds Gallery */}
          {generatedWorlds.length > 0 && (
            <div className="glass rounded-lg p-4">
              <h2 className="mb-2 text-sm font-medium">Your Worlds</h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {generatedWorlds.map((world) => (
                  <button
                    key={world.id}
                    onClick={() => handleSelectWorld(world)}
                    className={`w-full rounded-lg border p-2 text-left text-xs transition-colors ${
                      selectedWorldId === world.id
                        ? 'border-accent-primary bg-accent-primary/10'
                        : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="truncate font-medium">{world.prompt}</div>
                    <div className="text-text-tertiary">
                      {new Date(world.created_at).toLocaleDateString()}
                      {world.id === activeWorldId && ' • Active'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
