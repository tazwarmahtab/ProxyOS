'use client';

import type { AgentTask } from '@/hooks/useTasks';
import { useSkin } from '@/hooks/useSkin';
import { haltTask } from '@/lib/api';

interface SwarmDrawerProps {
  tasks: AgentTask[];
  loading: boolean;
  onClose: () => void;
}

export function SwarmDrawer({ tasks, loading, onClose }: SwarmDrawerProps) {
  const { activeSkin } = useSkin();

  const getAgentDisplayName = (role: string) => {
    const skinAgent = activeSkin.agents.find((a) => a.role === role);
    return skinAgent?.displayName || role;
  };

  const getAgentAvatar = (role: string) => {
    const skinAgent = activeSkin.agents.find((a) => a.role === role);
    return skinAgent?.avatarPath || '/skins/default/avatar-placeholder.png';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'working':
        return 'bg-accent-primary';
      case 'success':
        return 'bg-accent-success';
      case 'failed':
        return 'bg-accent-error';
      case 'halted':
        return 'bg-accent-warning';
      default:
        return 'bg-text-tertiary';
    }
  };

  const handleHalt = async (taskId: string) => {
    if (confirm('Halt this task?')) {
      try {
        await haltTask(taskId);
      } catch (err) {
        console.error('Failed to halt task:', err);
      }
    }
  };

  const tasksByAgent = {
    minion: tasks.filter((t) => t.agent_role === 'minion'),
    scout: tasks.filter((t) => t.agent_role === 'scout'),
    sage: tasks.filter((t) => t.agent_role === 'sage'),
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="glass-strong relative z-10 flex h-[70vh] w-full flex-col rounded-t-2xl border-t border-white/10">
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <h2 className="text-lg font-semibold">Swarm Activity</h2>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-sm hover:bg-white/5"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex h-full items-center justify-center text-text-secondary">
              Loading tasks...
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex h-full items-center justify-center text-text-secondary">
              No tasks yet. Feed context to your Proxy to get started!
            </div>
          ) : (
            <div className="space-y-4">
              {/* Minion */}
              {tasksByAgent.minion.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <img
                      src={getAgentAvatar('minion')}
                      alt={getAgentDisplayName('minion')}
                      className="h-6 w-6 rounded-full"
                    />
                    {getAgentDisplayName('minion')}
                  </h3>
                  <div className="space-y-2">
                    {tasksByAgent.minion.map((task) => (
                      <div
                        key={task.id}
                        className="glass rounded-lg border border-white/5 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="text-sm text-text-primary">
                              {task.task_description}
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                              <span
                                className={`h-2 w-2 rounded-full ${getStatusColor(task.status)}`}
                              />
                              <span className="text-xs text-text-secondary">
                                {task.status}
                              </span>
                              {task.execution_time_ms && (
                                <span className="text-xs text-text-tertiary">
                                  • {task.execution_time_ms}ms
                                </span>
                              )}
                            </div>
                            {task.output_log && (
                              <p className="mt-2 text-xs text-text-secondary line-clamp-2">
                                {task.output_log}
                              </p>
                            )}
                          </div>
                          {task.status === 'working' && (
                            <button
                              onClick={() => handleHalt(task.id)}
                              className="rounded px-2 py-1 text-xs hover:bg-white/5"
                            >
                              Halt
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Scout */}
              {tasksByAgent.scout.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <img
                      src={getAgentAvatar('scout')}
                      alt={getAgentDisplayName('scout')}
                      className="h-6 w-6 rounded-full"
                    />
                    {getAgentDisplayName('scout')}
                  </h3>
                  <div className="space-y-2">
                    {tasksByAgent.scout.map((task) => (
                      <div
                        key={task.id}
                        className="glass rounded-lg border border-white/5 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="text-sm text-text-primary">
                              {task.task_description}
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                              <span
                                className={`h-2 w-2 rounded-full ${getStatusColor(task.status)}`}
                              />
                              <span className="text-xs text-text-secondary">
                                {task.status}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sage */}
              {tasksByAgent.sage.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <img
                      src={getAgentAvatar('sage')}
                      alt={getAgentDisplayName('sage')}
                      className="h-6 w-6 rounded-full"
                    />
                    {getAgentDisplayName('sage')}
                  </h3>
                  <div className="space-y-2">
                    {tasksByAgent.sage.map((task) => (
                      <div
                        key={task.id}
                        className="glass rounded-lg border border-white/5 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="text-sm text-text-primary">
                              {task.task_description}
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                              <span
                                className={`h-2 w-2 rounded-full ${getStatusColor(task.status)}`}
                              />
                              <span className="text-xs text-text-secondary">
                                {task.status}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
