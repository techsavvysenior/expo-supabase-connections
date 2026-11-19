-- Profiles and connection requests, with the rules that guard them.
--
-- Design notes
--   * Clients can read, but never write, connection_requests directly.
--     Every write goes through a function below, so the daily limit and the
--     ownership checks cannot be skipped by calling the REST API by hand.
--   * Row-level security decides which rows a signed-in user can see.
--   * Column grants decide which columns. Other users' `plan` is not readable.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  plan text not null default 'free' check (plan in ('free', 'pro')),
  created_at timestamptz not null default now()
);

create table public.connection_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint no_self_request check (sender_id <> recipient_id)
);

-- One request per pair of people, whichever of them sent it.
create unique index connection_requests_pair_key
  on public.connection_requests (
    least(sender_id, recipient_id),
    greatest(sender_id, recipient_id)
  );

-- Supports the inbox query and the rolling 24-hour count.
create index connection_requests_recipient_status_idx
  on public.connection_requests (recipient_id, status);
create index connection_requests_sender_created_idx
  on public.connection_requests (sender_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.connection_requests enable row level security;

create policy "Signed-in users can read profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Participants can read their own requests"
  on public.connection_requests for select
  to authenticated
  using ((select auth.uid()) in (sender_id, recipient_id));

-- No insert, update or delete policy exists on connection_requests on purpose.

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- Start from nothing, then grant exactly what the app needs.
revoke all on public.profiles from anon, authenticated;
revoke all on public.connection_requests from anon, authenticated;

grant select (id, display_name, created_at) on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select on public.connection_requests to authenticated;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

create function public.daily_request_limit(p_plan text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_plan when 'pro' then 100 else 5 end;
$$;

-- Creates a profile row whenever someone signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'New member'
      ),
      60
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Sends a connection request on behalf of the signed-in user.
--
-- Raises (message is a stable code the app maps to text):
--   NOT_AUTHENTICATED, CANNOT_CONNECT_TO_SELF, RECIPIENT_NOT_FOUND,
--   ALREADY_REQUESTED, LIMIT_REACHED
create function public.send_connection_request(p_recipient_id uuid)
returns public.connection_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender uuid := (select auth.uid());
  v_plan text;
  v_limit integer;
  v_used integer;
  v_request public.connection_requests;
begin
  if v_sender is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  if p_recipient_id = v_sender then
    raise exception 'CANNOT_CONNECT_TO_SELF' using errcode = 'P0001';
  end if;

  -- Serialize this sender's requests. Without the lock, two requests sent at
  -- the same moment could both read "4 used" and both insert.
  perform pg_advisory_xact_lock(hashtextextended(v_sender::text, 0));

  select plan into v_plan from public.profiles where id = v_sender;
  if not found then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  if not exists (select 1 from public.profiles where id = p_recipient_id) then
    raise exception 'RECIPIENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.connection_requests
    where least(sender_id, recipient_id) = least(v_sender, p_recipient_id)
      and greatest(sender_id, recipient_id) = greatest(v_sender, p_recipient_id)
  ) then
    raise exception 'ALREADY_REQUESTED' using errcode = 'P0001';
  end if;

  v_limit := public.daily_request_limit(v_plan);

  select count(*) into v_used
  from public.connection_requests
  where sender_id = v_sender
    and created_at > now() - interval '24 hours';

  if v_used >= v_limit then
    raise exception 'LIMIT_REACHED' using
      errcode = 'P0001',
      detail = format('%s of %s requests used in the last 24 hours.', v_used, v_limit);
  end if;

  insert into public.connection_requests (sender_id, recipient_id)
  values (v_sender, p_recipient_id)
  returning * into v_request;

  return v_request;
end;
$$;

-- Accepts or declines a pending request addressed to the signed-in user.
-- A request that does not exist, belongs to someone else, or was already
-- answered all raise the same REQUEST_NOT_FOUND, so nothing leaks.
create function public.respond_to_connection_request(
  p_request_id uuid,
  p_accept boolean
)
returns public.connection_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_request public.connection_requests;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  update public.connection_requests
  set status = case when p_accept then 'accepted' else 'declined' end,
      responded_at = now()
  where id = p_request_id
    and recipient_id = v_user
    and status = 'pending'
  returning * into v_request;

  if not found then
    raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0001';
  end if;

  return v_request;
end;
$$;

-- The signed-in user's allowance, for showing "3 of 5 left" in the app.
-- next_slot_at is when the oldest request in the window stops counting.
create function public.connection_quota()
returns table (
  daily_limit integer,
  used integer,
  remaining integer,
  next_slot_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select public.daily_request_limit(p.plan) as daily_limit
    from public.profiles p
    where p.id = (select auth.uid())
  ),
  recent as (
    select r.created_at
    from public.connection_requests r
    where r.sender_id = (select auth.uid())
      and r.created_at > now() - interval '24 hours'
  )
  select
    me.daily_limit,
    (select count(*)::integer from recent),
    greatest(me.daily_limit - (select count(*)::integer from recent), 0),
    (select min(created_at) + interval '24 hours' from recent)
  from me;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.send_connection_request(uuid) from public, anon;
revoke execute on function public.respond_to_connection_request(uuid, boolean) from public, anon;
revoke execute on function public.connection_quota() from public, anon;

grant execute on function public.send_connection_request(uuid) to authenticated;
grant execute on function public.respond_to_connection_request(uuid, boolean) to authenticated;
grant execute on function public.connection_quota() to authenticated;
