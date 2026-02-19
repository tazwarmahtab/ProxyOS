'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export interface ProxyStats {
  energy_level: number;
  tasks_completed: number;
  projects_active: number;
  achievements: string[];
}

export function useProxyStats() {
  const [stats, setStats] = useState<ProxyStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const { data, error } = await supabase
          .from('proxy_stats')
          .select('*')
          .single();

        if (error) throw error;
        setStats(data);
      } catch (err) {
        console.error('Failed to load proxy stats:', err);
      } finally {
        setLoading(false);
      }
    }

    loadStats();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('proxy-stats-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'proxy_stats',
        },
        (payload) => {
          setStats(payload.new as ProxyStats);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { stats, loading };
}
