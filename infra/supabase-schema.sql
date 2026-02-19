-- ProxyOS Supabase schema
-- This file creates all core tables used by the backend and frontend.

------------------------------------------------------------
-- Extensions
------------------------------------------------------------

create extension if not exists "uuid-ossp";

------------------------------------------------------------
-- Core: Proxy context and agent tasks
------------------------------------------------------------

create table if not exists public.proxy_context (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz not null default now(),
  raw_input text not null,
  input_type varchar(20) not null default 'text', -- text, voice, link, file
  project_tag varchar(50),
  metadata jsonb not null default '{}'::jsonb,
  status varchar(20) not null default 'unassigned', -- unassigned, delegated, completed, error
  energy_gained integer not null default 10,
  request_id uuid,
  user_ip text
);

create table if not exists public.agent_tasks (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  context_id uuid references public.proxy_context(id) on delete set null,
  agent_role varchar(50) not null check (agent_role in ('minion', 'scout', 'sage')),
  task_description text not null,
  task_type varchar(50), -- code, research, strategy, qa, other
  status varchar(20) not null default 'pending' check (status in ('pending','working','success','failed','halted')),
  priority integer not null default 5,
  output_log text,
  execution_time_ms integer,
  retry_count integer not null default 0,
  lane_id varchar(50),
  project_tag varchar(50)
);

------------------------------------------------------------
-- Persistent memories & execution logs
------------------------------------------------------------

create table if not exists public.agent_memories (
  agent_role varchar(50) primary key
    check (agent_role in ('minion','scout','sage','proxy')),
  soul_markdown text not null,
  memory_markdown text not null,
  operational_rules jsonb not null default '{}'::jsonb,
  last_updated timestamptz not null default now(),
  version integer not null default 1
);

create table if not exists public.execution_logs (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz not null default now(),
  task_id uuid references public.agent_tasks(id) on delete cascade,
  agent_role varchar(50),
  log_type varchar(20), -- info, warning, error, success
  message text,
  metadata jsonb
);

------------------------------------------------------------
-- Proxy stats & preferences (including active skin)
------------------------------------------------------------

create table if not exists public.proxy_stats (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid default uuid_generate_v4(), -- simple single-user for v1
  energy_level integer not null default 50 check (energy_level >= 0 and energy_level <= 100),
  tasks_completed integer not null default 0,
  projects_active integer not null default 0,
  last_fed timestamptz not null default now(),
  achievements jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  active_skin_id text not null default 'default'
);

------------------------------------------------------------
-- World generator: generated worlds & office instances
------------------------------------------------------------

create table if not exists public.generated_worlds (
  id text primary key,
  prompt text not null,
  image_url text not null,
  thumbnail_url text,
  style_analysis jsonb not null,
  geometry_config jsonb not null,
  seed integer,
  created_at timestamptz not null default now(),
  user_id uuid,
  is_favorite boolean not null default false,
  usage_count integer not null default 0
);

create table if not exists public.office_instances (
  id uuid primary key default uuid_generate_v4(),
  world_id text references public.generated_worlds(id) on delete set null,
  user_id uuid,
  agent_positions jsonb not null default '{}'::jsonb,
  active_tasks uuid[] default '{}',
  created_at timestamptz not null default now(),
  last_active timestamptz not null default now()
);

------------------------------------------------------------
-- Agent locks (simple distributed lane locking)
------------------------------------------------------------

create table if not exists public.agent_locks (
  agent_role varchar(50) primary key,
  task_id uuid not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  instance_id text
);

------------------------------------------------------------
-- Outbound deliveries (for messaging channel replies)
------------------------------------------------------------

create table if not exists public.outbound_deliveries (
  id uuid primary key default uuid_generate_v4(),
  context_id uuid not null references public.proxy_context(id) on delete cascade,
  channel varchar(50) not null,
  channel_user_id text not null,
  channel_extra jsonb not null default '{}'::jsonb,
  payload text not null default '',
  status varchar(20) not null default 'pending' check (status in ('pending','sent','failed')),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_outbound_deliveries_context
  on public.outbound_deliveries(context_id);

create index if not exists idx_outbound_deliveries_pending
  on public.outbound_deliveries(status) where status = 'pending';

------------------------------------------------------------
-- Realtime publications
------------------------------------------------------------

alter publication supabase_realtime add table
  public.agent_tasks,
  public.proxy_context,
  public.proxy_stats,
  public.outbound_deliveries
on conflict do nothing;

------------------------------------------------------------
-- Indexes
------------------------------------------------------------

create index if not exists idx_agent_tasks_status
  on public.agent_tasks(status);

create index if not exists idx_agent_tasks_agent
  on public.agent_tasks(agent_role);

create index if not exists idx_proxy_context_project
  on public.proxy_context(project_tag);

create index if not exists idx_execution_logs_task
  on public.execution_logs(task_id);

create index if not exists idx_generated_worlds_user
  on public.generated_worlds(user_id);

------------------------------------------------------------
-- Seed data: initial memories & proxy stats
------------------------------------------------------------

insert into public.agent_memories (agent_role, soul_markdown, memory_markdown, operational_rules)
values
  (
    'minion',
    '# Minion: Technical Execution Engine\n\nI transform abstract requirements into production-ready code, scripts, and deployment plans. I prefer clear APIs, modular design, and automation over manual work.',
    '## Recent Executions\n- Bootstrapped ProxyOS schema\n- Drafted first backend endpoints\n- Set up basic CI commands',
    jsonb_build_object(
      'preferred_languages', jsonb_build_array('TypeScript','Python','Bash'),
      'deployment_target', 'vercel',
      'code_style', 'modular_documented'
    )
  ),
  (
    'scout',
    '# Scout: Research & Intel\n\nI gather high-signal information, structure it for immediate use, and always include citations or reference points. I avoid noisy or low-quality sources.',
    '## Recent Intelligence\n- Reviewed Supabase limits for free tier\n- Collected references for Hugging Face Spaces\n- Analysed design systems from top product tools',
    jsonb_build_object(
      'output_format', 'markdown_tables',
      'citation_required', true,
      'search_depth', 'comprehensive'
    )
  ),
  (
    'sage',
    '# Sage: Strategy & QA\n\nI enforce Apple-grade quality, cut bloat, and ensure flows feel cinematic and robust. I pay attention to edge cases, UX clarity, and long-term maintainability.',
    '## Recent Reviews\n- Approved initial ProxyOS architecture\n- Rejected inconsistent typography tokens\n- Flagged missing error states in Swarm drawer',
    jsonb_build_object(
      'quality_threshold', 'premium',
      'focus_areas', jsonb_build_array('visual_polish','operational_efficiency','scalability')
    )
  ),
  (
    'proxy',
    '# Proxy: The Digital Avatar\n\nI am the bridge between human intent and machine execution. I absorb context, maintain energy, and delegate with precision to the Minion, Scout, and Sage.',
    '## User Context Profile\n- Domains: building, transit, wholesale systems, trading\n- Preferences: direct communication, multi-country operations, high polish\n- Goal: replace busywork with durable systems',
    jsonb_build_object(
      'energy_decay_rate', 5,
      'context_retention_days', 90,
      'delegation_style', 'autonomous_with_checkpoints'
    )
  )
on conflict (agent_role) do nothing;

insert into public.proxy_stats (energy_level, achievements)
values (50, '["first_boot"]'::jsonb)
on conflict do nothing;

