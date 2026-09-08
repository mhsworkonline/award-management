-- Award Management — self-hosted short links (Settings -> Links & QR).
--
-- Replaces the free/anonymous TinyURL integration: that endpoint turned out
-- to route every link through a "deprecated" interstitial and then a
-- third-party ad redirector (redirect.viglink.com) before reaching the real
-- destination — broken outright for anyone with an ad blocker, and not
-- something to put in front of a public application-form link. Self-hosted
-- instead: our own table, our own /s/[code] redirect route, no third party
-- in the chain at all.
--
-- Generic on purpose, same as am_qr_codes... except there's no such table —
-- QR stayed fully stateless since a code is trivially regenerable from its
-- URL. A short link can't be: something has to remember what it points to
-- in order to redirect later, so unlike QR this one genuinely needs a table.

create table am_short_links (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references am_organizations(id) on delete cascade,
  code        text not null,
  target_url  text not null,
  click_count int not null default 0,
  created_by  text,
  created_at  timestamptz not null default now(),
  unique (code)
);
create index am_short_links_org_idx on am_short_links (org_id, created_at desc);

alter table am_short_links enable row level security;
create policy am_short_links_authenticated_all on am_short_links for all to authenticated using (true) with check (true);

-- Resolves a code to its target URL for the public /s/[code] redirect
-- route, incrementing the click counter in the same statement. SECURITY
-- DEFINER since anon has no direct table access — a public select policy
-- would expose created_by and every link's metadata, not just the one
-- being visited. Same shape as am_submit_public_application: the only door
-- in for anon is this function.
create or replace function am_resolve_short_link(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_url text;
begin
  update am_short_links set click_count = click_count + 1
  where code = p_code
  returning target_url into v_url;

  if v_url is null then
    return null;
  end if;
  return jsonb_build_object('target_url', v_url);
end;
$function$;

revoke all on function am_resolve_short_link(text) from public;
grant execute on function am_resolve_short_link(text) to anon, authenticated;
