const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:7860';

export interface FeedContextRequest {
  raw_input: string;
  input_type: 'text' | 'voice';
  project_tag?: string;
}

export interface SwarmStatusResponse {
  tasks: Array<{
    id: string;
    agent_role: string;
    task_description: string;
    status: string;
    created_at: string;
    output_log?: string;
  }>;
  proxy_stats: {
    energy_level: number;
    tasks_completed: number;
    projects_active: number;
  };
}

export async function feedContext(data: FeedContextRequest): Promise<void> {
  const response = await fetch(`${BACKEND_URL}/api/feed-context`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to feed context: ${error}`);
  }
}

export async function getSwarmStatus(): Promise<SwarmStatusResponse> {
  const response = await fetch(`${BACKEND_URL}/api/swarm-status`);
  if (!response.ok) {
    throw new Error('Failed to fetch swarm status');
  }
  return response.json();
}

export async function haltTask(taskId: string): Promise<void> {
  const response = await fetch(`${BACKEND_URL}/api/halt-task/${taskId}`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to halt task');
  }
}
