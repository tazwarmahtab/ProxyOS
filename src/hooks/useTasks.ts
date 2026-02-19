'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export interface AgentTask {
  id: string;
  context_id: string | null;
  agent_role: 'minion' | 'scout' | 'sage';
  task_description: string;
  task_type: string;
  status: 'pending' | 'working' | 'success' | 'failed' | 'halted';
  priority: number;
  output_log: string | null;
  execution_time_ms: number | null;
  retry_count: number;
  lane_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useTasks() {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial load
    async function loadTasks() {
      try {
        const { data, error } = await supabase
          .from('agent_tasks')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;
        setTasks(data || []);
      } catch (err) {
        console.error('Failed to load tasks:', err);
      } finally {
        setLoading(false);
      }
    }

    loadTasks();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('tasks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_tasks',
        },
        () => {
          // Reload tasks on any change
          loadTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { tasks, loading };
}
