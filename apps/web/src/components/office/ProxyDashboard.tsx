'use client';

import type { ProxyStats } from '@/hooks/useProxyStats';

interface ProxyDashboardProps {
  stats: ProxyStats | null;
  loading: boolean;
}

export function ProxyDashboard({ stats, loading }: ProxyDashboardProps) {
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-text-secondary">
        Loading...
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex h-full items-center justify-center text-text-secondary">
        No stats available
      </div>
    );
  }

  return (
    <div className="glass-strong w-full max-w-2xl rounded-2xl border border-white/10 p-8">
      <h1 className="mb-6 text-2xl font-bold">My Proxy</h1>

      <div className="space-y-6">
        {/* Energy Level */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-text-secondary">Energy</span>
            <span className="text-lg font-semibold">{stats.energy_level}/100</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-bg-secondary">
            <div
              className="h-full bg-accent-primary transition-all duration-300"
              style={{ width: `${Math.min(100, stats.energy_level)}%` }}
            />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="glass rounded-lg border border-white/5 p-4">
            <div className="text-2xl font-bold">{stats.tasks_completed}</div>
            <div className="text-sm text-text-secondary">Tasks Completed</div>
          </div>
          <div className="glass rounded-lg border border-white/5 p-4">
            <div className="text-2xl font-bold">{stats.projects_active}</div>
            <div className="text-sm text-text-secondary">Active Projects</div>
          </div>
        </div>

        {/* Achievements */}
        {stats.achievements && stats.achievements.length > 0 && (
          <div>
            <h2 className="mb-3 text-sm font-medium text-text-secondary">
              Achievements
            </h2>
            <div className="flex flex-wrap gap-2">
              {stats.achievements.map((ach, idx) => (
                <span
                  key={idx}
                  className="rounded-full bg-accent-secondary/20 px-3 py-1 text-xs font-medium text-accent-secondary"
                >
                  {ach}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Abilities */}
        <div>
          <h2 className="mb-3 text-sm font-medium text-text-secondary">
            Abilities
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="glass rounded-lg border border-white/5 p-3 text-center">
              <div className="text-lg">⚡</div>
              <div className="mt-1 text-xs text-text-secondary">Code</div>
            </div>
            <div className="glass rounded-lg border border-white/5 p-3 text-center">
              <div className="text-lg">🔍</div>
              <div className="mt-1 text-xs text-text-secondary">Research</div>
            </div>
            <div className="glass rounded-lg border border-white/5 p-3 text-center">
              <div className="text-lg">🎯</div>
              <div className="mt-1 text-xs text-text-secondary">Strategy</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
