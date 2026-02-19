'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useSkin } from '@/hooks/useSkin';
import type { Skin } from '@proxyos/shared/skins';

interface MemoryVaultProps {
  activeSkin: Skin;
  onClose: () => void;
}

interface AgentMemory {
  agent_role: string;
  soul_markdown: string;
  memory_markdown: string;
  version: number;
  last_updated: string;
}

export function MemoryVault({ activeSkin, onClose }: MemoryVaultProps) {
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const { setSkin } = useSkin();

  useEffect(() => {
    async function loadMemories() {
      try {
        const { data, error } = await supabase
          .from('agent_memories')
          .select('*')
          .order('last_updated', { ascending: false });

        if (error) throw error;
        setMemories(data || []);
      } catch (err) {
        console.error('Failed to load memories:', err);
      } finally {
        setLoading(false);
      }
    }

    loadMemories();
  }, []);

  const filteredMemories = memories.filter((mem) => {
    if (selectedAgent && mem.agent_role !== selectedAgent) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        mem.agent_role.toLowerCase().includes(query) ||
        mem.soul_markdown.toLowerCase().includes(query) ||
        mem.memory_markdown.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const getAgentDisplayName = (role: string) => {
    const skinAgent = activeSkin.agents.find((a) => a.role === role);
    return skinAgent?.displayName || role;
  };

  const getAgentAvatar = (role: string) => {
    const skinAgent = activeSkin.agents.find((a) => a.role === role);
    return skinAgent?.avatarPath || '/skins/default/avatar-placeholder.png';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="glass-strong relative z-10 flex h-[80vh] w-full max-w-4xl flex-col rounded-2xl border border-white/10">
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <h2 className="text-xl font-semibold">Memory Vault</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                // Open skin selector
                const skinId = prompt('Enter skin ID (default or portalSciFi):');
                if (skinId && (skinId === 'default' || skinId === 'portalSciFi')) {
                  setSkin(skinId as any);
                }
              }}
              className="rounded-lg px-3 py-1 text-sm hover:bg-white/5"
            >
              Change Skin
            </button>
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-1 text-sm hover:bg-white/5"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 border-b border-white/10 p-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search memories..."
            className="flex-1 rounded-lg bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary"
          />
          <div className="flex gap-1">
            {['proxy', 'minion', 'scout', 'sage'].map((role) => (
              <button
                key={role}
                onClick={() =>
                  setSelectedAgent(selectedAgent === role ? null : role)
                }
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  selectedAgent === role
                    ? 'bg-accent-primary text-white'
                    : 'bg-bg-secondary hover:bg-bg-elevated'
                }`}
              >
                {getAgentDisplayName(role)}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex h-full items-center justify-center text-text-secondary">
              Loading memories...
            </div>
          ) : filteredMemories.length === 0 ? (
            <div className="flex h-full items-center justify-center text-text-secondary">
              No memories found
            </div>
          ) : (
            <div className="space-y-4">
              {filteredMemories.map((mem) => (
                <div
                  key={mem.agent_role}
                  className="glass rounded-lg border border-white/5 p-4"
                >
                  <div className="mb-3 flex items-center gap-3">
                    <img
                      src={getAgentAvatar(mem.agent_role)}
                      alt={getAgentDisplayName(mem.agent_role)}
                      className="h-10 w-10 rounded-full"
                    />
                    <div>
                      <h3 className="font-medium">
                        {getAgentDisplayName(mem.agent_role)}
                      </h3>
                      <p className="text-xs text-text-secondary">
                        Version {mem.version} • Updated{' '}
                        {new Date(mem.last_updated).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <h4 className="mb-1 text-xs font-medium text-text-secondary">
                        Soul
                      </h4>
                      <div className="rounded bg-bg-secondary p-2 text-sm">
                        <pre className="whitespace-pre-wrap font-mono text-xs">
                          {mem.soul_markdown.substring(0, 200)}
                          {mem.soul_markdown.length > 200 && '...'}
                        </pre>
                      </div>
                    </div>

                    <div>
                      <h4 className="mb-1 text-xs font-medium text-text-secondary">
                        Memory
                      </h4>
                      <div className="rounded bg-bg-secondary p-2 text-sm">
                        <pre className="whitespace-pre-wrap font-mono text-xs">
                          {mem.memory_markdown.substring(0, 300)}
                          {mem.memory_markdown.length > 300 && '...'}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
