-- Run once in Supabase > SQL Editor. Creates the table for gala requests.
create table if not exists public.gala_requests (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  name        text not null,
  phone       text not null,
  email       text not null,
  source      text,
  user_agent  text,
  status      text not null default 'new'   -- new / contacted / confirmed / paid / declined
);

-- Only the server (service_role key) may read or write. The public site never talks to the table directly.
alter table public.gala_requests enable row level security;
