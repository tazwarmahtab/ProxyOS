'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useTasks } from '@/hooks/useTasks';
import { useProxyStats } from '@/hooks/useProxyStats';
import { useSkin } from '@/hooks/useSkin';
import { CommandCenter } from '@/components/office/CommandCenter';
import { SwarmDrawer } from '@/components/office/SwarmDrawer';
import { ProxyDashboard } from '@/components/office/ProxyDashboard';
import { MemoryVault } from '@/components/office/MemoryVault';

const OfficeCanvas = dynamic(
  () => import('@/components/game/OfficeCanvas').then((mod) => mod.OfficeCanvas),
  { ssr: false }
);

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'office' | 'proxy'>('office');
  const [swarmDrawerOpen, setSwarmDrawerOpen] = useState(false);
  const [memoryVaultOpen, setMemoryVaultOpen] = useState(false);
  const { tasks, loading: tasksLoading } = useTasks();
  const { stats, loading: statsLoading } = useProxyStats();
  const { activeSkin } = useSkin();

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-bg-primary text-text-primary">
      {/* Top Navigation */}
      <header className="glass-strong flex h-14 items-center justify-between border-b border-white/10 px-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSwarmDrawerOpen(!swarmDrawerOpen)}
            className="rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-white/5"
          >
            ☰
          </button>
          <h1 className="text-lg font-semibold">ProxyOS</h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('office')}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'office'
                ? 'bg-accent-primary/20 text-accent-primary'
                : 'hover:bg-white/5'
            }`}
          >
            Office
          </button>
          <button
            onClick={() => setActiveTab('proxy')}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'proxy'
                ? 'bg-accent-primary/20 text-accent-primary'
                : 'hover:bg-white/5'
            }`}
          >
            My Proxy
          </button>
          <button
            onClick={() => setMemoryVaultOpen(true)}
            className="rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-white/5"
          >
            Memory Vault
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative flex-1 overflow-hidden">
        {activeTab === 'office' ? (
          <div className="relative h-full w-full">
            <OfficeCanvas tasks={tasks} activeSkin={activeSkin} />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-8">
            <ProxyDashboard stats={stats} loading={statsLoading} />
          </div>
        )}

        {/* Command Center - Fixed Bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <CommandCenter
            stats={stats}
            onTaskSubmitted={() => {
              // Tasks will update via realtime
            }}
          />
        </div>
      </main>

      {/* Swarm Activity Drawer */}
      {swarmDrawerOpen && (
        <SwarmDrawer
          tasks={tasks}
          loading={tasksLoading}
          onClose={() => setSwarmDrawerOpen(false)}
        />
      )}

      {/* Memory Vault Modal */}
      {memoryVaultOpen && (
        <MemoryVault
          activeSkin={activeSkin}
          onClose={() => setMemoryVaultOpen(false)}
        />
      )}
    </div>
  );
}
