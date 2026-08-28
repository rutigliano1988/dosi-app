-- Pieza B — Web Push: suscripciones, alertas "una vez", contador de avisos por dosis.
-- Aplicada a uwcktxqrfuelmscmkhbs vía MCP apply_migration (nombre: pieza_b_push).

create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  action_secret text not null,
  timezone      text not null,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "own subs" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

create table if not exists public.sent_alerts (
  user_id uuid not null references auth.users(id) on delete cascade,
  med_id  text not null references public.medicines(id) on delete cascade,
  kind    text not null check (kind in ('stock','expiry')),
  sent_at timestamptz not null default now(),
  primary key (user_id, med_id, kind)
);

alter table public.sent_alerts enable row level security;

create policy "own alerts" on public.sent_alerts
  for select using (auth.uid() = user_id);

alter table public.doses add column if not exists reminded_count smallint not null default 0;
alter table public.doses add column if not exists reminded_at    timestamptz;
