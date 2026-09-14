-- ---------------------------------------------------------------------------
-- SiteForge AI — 0001 : prospection, CRM, sites, hébergement, emailing
-- PostgreSQL / Supabase
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

-- --- Types ------------------------------------------------------------------
do $$ begin
  create type prospect_statut as enum ('non_vu', 'en_attente', 'client', 'refuse');
exception when duplicate_object then null; end $$;

do $$ begin
  create type site_statut as enum ('brouillon', 'test', 'production', 'maintenance', 'hors_ligne');
exception when duplicate_object then null; end $$;

do $$ begin
  create type validation_statut as enum ('envoyee', 'approuvee', 'modifications_demandees', 'expiree');
exception when duplicate_object then null; end $$;

-- --- Prospection ------------------------------------------------------------

-- Prospects issus du croisement SIRENE + Perplexity.
-- Workflow à 4 états : 🕐 non vu / ⏳ en attente / ✅ client / ❌ refusé
create table if not exists prospects (
  id                    uuid primary key default gen_random_uuid(),
  raison_sociale        text not null,
  siret                 text,
  siren                 text,
  secteur               text,
  code_naf              text,
  adresse               text,
  code_postal           text,
  ville                 text,
  departement           text,
  email                 text,
  telephone             text,
  site_web_existant     text,
  site_obsolete         boolean not null default false,
  score                 integer not null default 0 check (score between 0 and 100),
  statut                prospect_statut not null default 'non_vu',
  -- Comparateur concurrentiel interne : prix relevé chez la concurrence locale
  prix_concurrence_min  numeric(10, 2),
  prix_concurrence_max  numeric(10, 2),
  source_concurrence    text,
  source                text not null default 'perplexity+sirene',
  notes_ia              text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists prospects_statut_idx on prospects (statut);
create index if not exists prospects_secteur_idx on prospects (secteur);
create index if not exists prospects_cp_idx on prospects (code_postal);
create unique index if not exists prospects_siret_key on prospects (siret) where siret is not null;

-- Déduplication multi-canal : tout SIRET déjà démarché est mémorisé ici.
create table if not exists prospects_history (
  id            uuid primary key default gen_random_uuid(),
  siret         text not null unique,
  raison_sociale text,
  canal         text not null default 'email',
  dernier_statut prospect_statut not null default 'non_vu',
  premier_contact timestamptz not null default now(),
  dernier_contact timestamptz not null default now(),
  nb_contacts   integer not null default 1
);

create table if not exists recherches_perplexity (
  id            uuid primary key default gen_random_uuid(),
  requete       text not null,
  secteur       text,
  zone          text,
  modele        text,
  nb_resultats  integer not null default 0,
  cout_estime   numeric(10, 4) not null default 0,
  reponse_brute jsonb,
  created_at    timestamptz not null default now()
);

-- --- CRM --------------------------------------------------------------------

create table if not exists clients (
  id              uuid primary key default gen_random_uuid(),
  prospect_id     uuid references prospects (id) on delete set null,
  raison_sociale  text not null,
  contact_nom     text,
  email           text not null,
  telephone       text,
  siret           text,
  secteur         text,
  adresse         text,
  code_postal     text,
  ville           text,
  stripe_customer_id text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists clients_email_idx on clients (email);
create unique index if not exists clients_siret_key on clients (siret) where siret is not null;

create table if not exists notes (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references clients (id) on delete cascade,
  prospect_id uuid references prospects (id) on delete cascade,
  auteur      text not null default 'system',
  contenu     text not null,
  created_at  timestamptz not null default now(),
  constraint notes_cible_check check (client_id is not null or prospect_id is not null)
);

-- --- Sites ------------------------------------------------------------------

create table if not exists sites (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references clients (id) on delete cascade,
  nom               text not null,
  secteur           text,
  statut            site_statut not null default 'brouillon',
  url_test          text,
  url_production    text,
  version_actuelle  integer not null default 1,
  nb_pages          integer not null default 5,
  options_actives   jsonb not null default '[]'::jsonb,
  cout_generation_ia numeric(10, 4) not null default 0,
  derniere_generation timestamptz,
  mise_en_production_le timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists sites_client_idx on sites (client_id);
create index if not exists sites_statut_idx on sites (statut);

-- Historique de versions, support du rollback.
create table if not exists site_versions (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references sites (id) on delete cascade,
  version       integer not null,
  libelle       text,
  contenu       jsonb not null default '{}'::jsonb,
  prompt_utilise text,
  modele_ia     text,
  cout_ia       numeric(10, 4) not null default 0,
  deploy_url    text,
  cree_par      text not null default 'ia',
  created_at    timestamptz not null default now(),
  unique (site_id, version)
);

create table if not exists validations_client (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references sites (id) on delete cascade,
  version       integer not null,
  token         text not null unique,
  statut        validation_statut not null default 'envoyee',
  commentaire   text,
  envoye_le     timestamptz not null default now(),
  repondu_le    timestamptz,
  expire_le     timestamptz not null default (now() + interval '30 days')
);

-- --- Hébergement ------------------------------------------------------------

create table if not exists hosting_instances (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null references sites (id) on delete cascade,
  plateforme      text not null default 'vercel',
  projet_externe_id text,
  domaine         text,
  sous_domaine    text,
  statut_ssl      text not null default 'en_attente',
  dns_configure   boolean not null default false,
  cout_mensuel_reel numeric(10, 4) not null default 0,
  prix_facture_mensuel numeric(10, 2) not null default 0,
  derniere_verification timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists hosting_site_idx on hosting_instances (site_id);

-- --- Emailing RGPD (opt-out B2B) --------------------------------------------

create table if not exists emails_envoyes (
  id            uuid primary key default gen_random_uuid(),
  prospect_id   uuid references prospects (id) on delete set null,
  client_id     uuid references clients (id) on delete set null,
  destinataire  text not null,
  sujet         text not null,
  gabarit       text,
  statut        text not null default 'envoye',
  ouvert        boolean not null default false,
  clique        boolean not null default false,
  token_desinscription text not null,
  provider_id   text,
  envoye_le     timestamptz not null default now()
);

create index if not exists emails_destinataire_idx on emails_envoyes (destinataire);

-- Consultée avant TOUT envoi. Désinscription effective sous 24h.
create table if not exists unsubscribed_emails (
  email         text primary key,
  motif         text,
  source        text not null default 'lien_desinscription',
  desinscrit_le timestamptz not null default now()
);

-- --- Publicité --------------------------------------------------------------

create table if not exists campagnes_ads (
  id                uuid primary key default gen_random_uuid(),
  plateforme        text not null default 'meta',
  nom               text not null,
  statut            text not null default 'active',
  budget            numeric(10, 2) not null default 0,
  depense           numeric(10, 2) not null default 0,
  leads             integer not null default 0,
  conversions       integer not null default 0,
  revenus_attribues numeric(10, 2) not null default 0,
  date_debut        date,
  date_fin          date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Coût/lead et ROAS dérivés, jamais stockés (évite les valeurs incohérentes).
create or replace view campagnes_ads_kpi as
select
  c.*,
  case when c.leads > 0 then round(c.depense / c.leads, 2) else null end as cout_par_lead,
  case when c.depense > 0 then round(c.revenus_attribues / c.depense, 2) else null end as roas
from campagnes_ads c;
