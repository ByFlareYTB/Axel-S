-- ---------------------------------------------------------------------------
-- SiteForge AI — 0002 : moteur de tarification hybride, devis, factures,
-- abonnements récurrents et historique des prix appliqués.
-- ---------------------------------------------------------------------------

do $$ begin
  create type pricing_type as enum ('base', 'option', 'abonnement');
exception when duplicate_object then null; end $$;

do $$ begin
  create type devis_statut as enum ('brouillon', 'envoye', 'accepte', 'refuse', 'expire');
exception when duplicate_object then null; end $$;

do $$ begin
  create type facture_statut as enum ('brouillon', 'emise', 'payee', 'impayee', 'annulee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type abonnement_statut as enum ('actif', 'en_echec', 'suspendu', 'annule');
exception when duplicate_object then null; end $$;

-- --- Grille tarifaire, modifiable sans toucher au code ----------------------
create table if not exists pricing_rules (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  nom             text not null,
  type            pricing_type not null,
  prix            numeric(10, 2) not null check (prix >= 0),
  unite           text not null default 'forfait', -- forfait | page | langue | mois
  quantifiable    boolean not null default false,
  description     text,
  -- Coûts de production servant au calcul de marge en temps réel.
  cout_ia_estime  numeric(10, 4) not null default 0,
  cout_hebergement_mensuel numeric(10, 4) not null default 0,
  actif           boolean not null default true,
  ordre           integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists pricing_rules_type_idx on pricing_rules (type) where actif;

-- --- Offres de lancement dégressives ---------------------------------------
create table if not exists offres_promo (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  libelle         text not null,
  -- 'pourcentage_oneshot' | 'pourcentage_abonnement' | 'mois_offerts'
  type_remise     text not null,
  valeur          numeric(10, 2) not null default 0,
  duree_mois      integer not null default 0,
  actif           boolean not null default false,
  date_debut      date,
  date_fin        date,
  created_at      timestamptz not null default now()
);

-- --- Devis ------------------------------------------------------------------
create table if not exists devis (
  id                    uuid primary key default gen_random_uuid(),
  numero                text not null unique,
  client_id             uuid not null references clients (id) on delete cascade,
  site_id               uuid references sites (id) on delete set null,
  -- Lignes figées au moment du devis : [{code, nom, prix_unitaire, quantite, total}]
  options_selectionnees jsonb not null default '[]'::jsonb,
  promo_code            text,
  total_oneshot         numeric(10, 2) not null default 0,
  total_mensuel         numeric(10, 2) not null default 0,
  remise                numeric(10, 2) not null default 0,
  total                 numeric(10, 2) not null default 0,
  -- Instantané du calculateur de marge au moment de l'émission.
  cout_ia_estime        numeric(10, 4) not null default 0,
  cout_hebergement_estime numeric(10, 4) not null default 0,
  cout_acquisition_ads  numeric(10, 2) not null default 0,
  marge_oneshot         numeric(10, 2) not null default 0,
  marge_oneshot_pct     numeric(6, 2) not null default 0,
  marge_mensuelle       numeric(10, 2) not null default 0,
  alerte_marge          boolean not null default false,
  statut                devis_statut not null default 'brouillon',
  pdf_url               text,
  envoye_le             timestamptz,
  accepte_le            timestamptz,
  valide_jusqu_au       date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists devis_client_idx on devis (client_id);
create index if not exists devis_statut_idx on devis (statut);

-- --- Factures ---------------------------------------------------------------
create table if not exists factures (
  id              uuid primary key default gen_random_uuid(),
  numero          text not null unique,
  devis_id        uuid references devis (id) on delete set null,
  client_id       uuid not null references clients (id) on delete cascade,
  abonnement_id   uuid,
  lignes          jsonb not null default '[]'::jsonb,
  total_ht        numeric(10, 2) not null default 0,
  -- Microentreprise : TVA non applicable, art. 293 B du CGI.
  tva             numeric(10, 2) not null default 0,
  total_ttc       numeric(10, 2) not null default 0,
  statut_paiement facture_statut not null default 'brouillon',
  moyen_paiement  text,
  stripe_payment_intent text,
  date            date not null default current_date,
  date_echeance   date,
  date_paiement   timestamptz,
  pdf_url         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists factures_client_idx on factures (client_id);
create index if not exists factures_statut_idx on factures (statut_paiement);

-- --- Abonnements récurrents (Hébergement & Maintenance) ---------------------
create table if not exists abonnements (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references clients (id) on delete cascade,
  site_id             uuid references sites (id) on delete set null,
  pricing_rule_code   text not null default 'abo_hebergement',
  prix_mensuel        numeric(10, 2) not null default 0,
  promo_code          text,
  statut              abonnement_statut not null default 'actif',
  statut_stripe       text,
  stripe_subscription_id text,
  prochaine_echeance  date,
  echecs_paiement     integer not null default 0,
  suspendu_le         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists abonnements_client_idx on abonnements (client_id);
create index if not exists abonnements_statut_idx on abonnements (statut);

alter table factures
  drop constraint if exists factures_abonnement_id_fkey;
alter table factures
  add constraint factures_abonnement_id_fkey
  foreign key (abonnement_id) references abonnements (id) on delete set null;

-- --- Historique des prix appliqués par client -------------------------------
-- Conserve la trace de ce qui a été facturé même si la grille évolue ensuite.
create table if not exists historique_prix (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients (id) on delete cascade,
  devis_id      uuid references devis (id) on delete set null,
  pricing_code  text not null,
  libelle       text not null,
  prix_applique numeric(10, 2) not null,
  prix_grille   numeric(10, 2) not null,
  quantite      integer not null default 1,
  motif         text,
  applique_le   timestamptz not null default now()
);

create index if not exists historique_prix_client_idx on historique_prix (client_id);

-- --- Vue : marge nette par site --------------------------------------------
create or replace view marges_sites as
select
  s.id                       as site_id,
  s.client_id,
  s.nom,
  s.statut,
  coalesce(f.revenu_encaisse, 0)                       as revenu_encaisse,
  s.cout_generation_ia                                 as cout_ia,
  coalesce(h.cout_mensuel_reel, 0)                     as cout_hebergement_mensuel,
  coalesce(f.revenu_encaisse, 0)
    - s.cout_generation_ia
    - coalesce(h.cout_mensuel_reel, 0)                 as marge_nette
from sites s
left join hosting_instances h on h.site_id = s.id
left join lateral (
  select sum(fa.total_ttc) as revenu_encaisse
  from factures fa
  where fa.client_id = s.client_id and fa.statut_paiement = 'payee'
) f on true;
