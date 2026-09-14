-- ---------------------------------------------------------------------------
-- SiteForge AI — 0004 : sauvegarde unique par site + notifications internes.
-- ---------------------------------------------------------------------------

-- --- Sauvegarde unique ------------------------------------------------------
-- Un site conserve exactement deux états : la production courante et LA
-- sauvegarde (l'état précédent, écrasé à chaque modification). Voir
-- src/lib/pipeline/sauvegarde.ts.
alter table sites
  add column if not exists version_sauvegarde integer;

comment on column sites.version_sauvegarde is
  'Version conservée en sauvegarde. Une seule, écrasée à chaque nouvelle mise en production.';

-- --- Notifications internes -------------------------------------------------
do $$ begin
  create type notification_niveau as enum ('info', 'succes', 'alerte');
exception when duplicate_object then null; end $$;

create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  type        text not null,
  niveau      notification_niveau not null default 'info',
  titre       text not null,
  message     text not null,
  -- Lien interne vers l'écran où traiter la notification.
  lien        text,
  client_id   uuid references clients (id) on delete cascade,
  site_id     uuid references sites (id) on delete cascade,
  lu          boolean not null default false,
  lu_le       timestamptz,
  created_at  timestamptz not null default now()
);

-- L'index partiel sert la requête la plus fréquente : le compteur de la cloche.
create index if not exists notifications_non_lues_idx on notifications (created_at desc) where not lu;
create index if not exists notifications_client_idx on notifications (client_id);

-- --- Purge des versions excédentaires --------------------------------------
-- Aligne les bases existantes sur la règle « deux états au plus » : on garde
-- la version courante de chaque site et celle qui la précède immédiatement.
with a_conserver as (
  select sv.id
  from site_versions sv
  join sites s on s.id = sv.site_id
  where sv.version >= s.version_actuelle - 1
)
delete from site_versions
where id not in (select id from a_conserver);

-- Renseigne la sauvegarde là où une version précédente subsiste.
update sites s
set version_sauvegarde = v.version
from (
  select site_id, max(version) as version
  from site_versions
  group by site_id
) v
where v.site_id = s.id
  and v.version < s.version_actuelle
  and s.version_sauvegarde is null;
