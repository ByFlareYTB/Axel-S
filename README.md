# SiteForge AI

Application de pilotage d'une microentreprise de création de sites web pour
TPE, artisans et commerçants : **prospection → génération IA → validation client
→ hébergement → facturation**, entièrement automatisée et pilotée depuis une
seule interface mono-utilisateur.

Le dépôt démarre en **mode démo** : l'application tourne avec des données
fictives cohérentes, sans base de données, sans clé d'API et sans compte
Stripe.

```bash
npm install
npm run dev     # http://localhost:3000 — identifiants : contact@siteforge.ai / demo
```

---

## Sommaire

- [Démarrage](#démarrage)
- [Modules](#modules)
- [Moteur de tarification](#moteur-de-tarification)
- [Pipeline de génération](#pipeline-de-génération)
- [Conformité RGPD](#conformité-rgpd)
- [Passer en production](#passer-en-production)
- [Architecture](#architecture)
- [Scripts](#scripts)
- [Annexe Claude Code](#annexe-claude-code)

---

## Démarrage

### Mode démo (par défaut)

```bash
npm install
npm run dev
```

Connexion : `contact@siteforge.ai` / mot de passe `demo`.

Un bandeau orange rappelle en permanence que le mode démo est actif. Toutes les
actions fonctionnent — recherche de prospects, génération de site, mise en
production, devis, facture, PDF — mais aucun appel réseau n'est émis et rien
n'est persisté au-delà du redémarrage du serveur.

### Vérifications

```bash
npm run typecheck   # tsc --noEmit
npm test            # 33 tests (tarification, marge, PDF, couche de données)
npm run build       # build de production
```

---

## Modules

| Page | Contenu |
| --- | --- |
| **Dashboard** | Clients démarchés, taux de conversion, revenus jour/semaine/mois, sites réalisés et actifs, sites en attente de validation, **marge nette moyenne par site**, **MRR** des abonnements, revenus Ads, devis sous les seuils de marge |
| **Recherche client** | Filtres secteur / code postal, recherche croisée SIRENE + Perplexity, workflow à 4 emojis 🕐 ⏳ ✅ ❌, déduplication par SIRET, relevé des prix de la concurrence locale |
| **Clients** | Fiche CRM : coordonnées, SIRET, secteur, rentabilité du compte, sites, devis, factures, abonnement, notes — et la génération de site en un clic |
| **Sites créés** | Statuts brouillon / test / production / maintenance / hors ligne, historique des versions avec **rollback**, suivi des validations client |
| **Facturation & tarification** | Configurateur de devis instantané, calculateur de marge en temps réel, devis, factures, abonnements récurrents |
| **Hébergement** | Vue consolidée par site : plateforme, domaine, statut SSL, DNS, coût réel mensuel **comparé au prix facturé** |
| **Publicité** | Meta Ads et Google Ads en lecture : budget, dépensé, leads, coût/lead, conversions, revenus attribués, ROAS |
| **Paramètres** | Grille tarifaire éditable, offres de lancement, seuils de marge, état des intégrations, rappel RGPD |

Deux pages publiques, destinées au client final et non protégées par
l'authentification :

- `/validation/<token>` — boutons « j'approuve » / « je souhaite des modifications »
- `/desinscription/<token>` — désinscription en un clic

---

## Moteur de tarification

Base fixe très compétitive **+ options modulables à la carte**. Toutes les
valeurs vivent dans la table `pricing_rules` : les ajuster (test de prix,
promotion de lancement, remise fidélité) ne demande aucun redéploiement.

| Élément | Prix | Inclus |
| --- | --- | --- |
| Base « Site Essentiel » (paiement unique) | 249 € | Génération IA complète, jusqu'à 5 pages, design sur-mesure par secteur, responsive, formulaire de contact, SEO de base, déploiement test + production automatisé |
| Abonnement Hébergement & Maintenance | 19 €/mois | Hébergement, SSL, sauvegardes, monitoring, 2 mises à jour de contenu par an |
| Page supplémentaire | 29 €/page | Page additionnelle générée et intégrée par l'IA |
| Réservation / rendez-vous en ligne | 89 € | Module de prise de RDV intégré |
| Boutique en ligne (Stripe) | 199 € | Catalogue produits + paiement en ligne |
| Multilingue | 39 €/langue | Traduction IA + adaptation SEO |
| Refonte design premium | 99 € | Templates avancés, direction artistique renforcée |
| Rédaction et retouche photo IA | 49 € | Optimisation visuelle du contenu client |
| Livraison express (48 h) | +79 € | Priorité de génération et de validation |
| Mise à jour ponctuelle hors abonnement | 25 € | Modification à la demande |
| Pack visibilité | 59 € | Fiche Google Business + réseaux sociaux |

### Calculateur de marge en temps réel

À chaque frappe dans le configurateur, l'application affiche :

```
Marge prestation  = prix facturé − coût API IA − coût d'acquisition Ads
Marge mensuelle   = abonnement facturé − coût d'hébergement réel
Marge 12 mois     = marge prestation + 12 mensualités (mois offerts déduits)
```

Deux seuils d'alerte, réglables dans **Paramètres** :

- `marge_min_oneshot_pct` — défaut **70 %** sur la prestation initiale
- `marge_min_abonnement_eur` — défaut **12 €** de marge nette mensuelle

Un devis qui passe sous un seuil est marqué `alerte_marge`, surligné dans la
liste, remonté sur le Dashboard et notifié par alerte temps réel.

Le même moteur (`src/lib/pricing/`) sert au navigateur et au serveur : le prix
affiché et le prix enregistré ne peuvent pas diverger.

### Offres de lancement dégressives

Trois formes de remise, cumulables avec le suivi de marge :

- `pourcentage_oneshot` — ex. « −20 % sur la prestation initiale »
- `pourcentage_abonnement` — ex. « −30 % les 3 premiers mois »
- `mois_offerts` — ex. « 1er mois d'hébergement offert »

### Historique des prix appliqués

Chaque ligne de chaque devis est copiée dans `historique_prix` avec le prix
appliqué **et** le prix de la grille au moment de l'émission. Faire évoluer la
grille ne réécrit jamais l'histoire de ce qui a été facturé.

### Comparateur concurrentiel interne

Les prix relevés localement (via la veille Perplexity) sont stockés sur la fiche
prospect et transformés en argumentaire commercial chiffré : « 3,6 à 16,9 fois
moins cher que les offres relevées localement, site en ligne en quelques jours ».

---

## Pipeline de génération

Depuis la fiche client, en un clic :

```
analyse IA → génération (API Claude, prompt structuré par secteur)
  → déploiement test (Vercel preview)
    → email de validation au client
       ├─ « je souhaite des modifications » → boucle de retouches ciblées (v+1)
       └─ « j'approuve »
             → déploiement production + domaine + DNS/SSL (Cloudflare)
             → mentions légales, formulaire réel
             → devis généré automatiquement selon les options livrées
             → facture émise + abonnement mensuel ouvert
```

Chaque génération crée une version dans `site_versions` avec son coût IA réel,
ce qui rend le rollback possible et la marge par site vérifiable.

Les mentions légales ne sont **jamais** laissées à la génération IA : elles sont
composées par l'application à partir des données du client et de l'éditeur.

---

## Conformité RGPD

Prospection sous le régime **opt-out B2B** validé par la CNIL :

- adresses professionnelles uniquement ;
- objet du message en lien direct avec l'activité du destinataire ;
- identité de l'expéditeur dans chaque email (nom, SIREN, adresse) ;
- lien de désinscription effectif, prise en compte immédiate (obligation : 24 h) ;
- la table `unsubscribed_emails` est consultée **avant tout envoi**, dans
  `envoyerEmail()` — il n'existe aucun chemin de code qui la contourne ;
- conservation limitée à 3 ans après le dernier contact actif
  (`retention_prospect_mois`).

---

## Passer en production

### 1. Base de données

```bash
export DATABASE_URL="postgresql://…"      # Supabase
npm run db:migrate
```

Les migrations créent l'ensemble du schéma et insèrent la grille tarifaire par
défaut. Elles sont idempotentes et suivies dans une table `_migrations`.

### 2. Identifiants d'accès

```bash
node scripts/hash-password.mjs "votreMotDePasse"   # → AUTH_PASSWORD_HASH=…
node scripts/totp-secret.mjs contact@siteforge.ai  # → AUTH_TOTP_SECRET=… + QR otpauth://
```

Dès que `AUTH_TOTP_SECRET` est renseigné, la 2FA devient obligatoire.
Générez aussi un `SESSION_SECRET` aléatoire d'au moins 32 caractères.

### 3. Clés d'API

Copiez `.env.example` vers `.env.local` et renseignez ce dont vous avez besoin :
Claude, Perplexity, Vercel, Cloudflare, Stripe, Resend ou Brevo, Meta/Google Ads.

### 4. Bascule

```bash
DEMO_MODE=false npm run build && npm start
```

La page **Paramètres** affiche l'état de chaque intégration : vous voyez d'un
coup d'œil ce qui est branché et ce qui manque.

### Webhook Stripe

Pointez-le sur `POST /api/stripe/webhook` et renseignez `STRIPE_WEBHOOK_SECRET`.
Les événements traités : `checkout.session.completed` et `invoice.paid`
(encaissement), `invoice.payment_failed` (relance puis suspension du site après
3 échecs).

---

## Architecture

```
src/
├─ app/                      pages (App Router) et routes d'API
├─ components/               interface partagée, aucune dépendance graphique externe
└─ lib/
   ├─ config.ts              configuration et formatage € / dates
   ├─ types.ts               types métier, miroir du schéma SQL
   ├─ db/                    adaptateurs de données
   │  ├─ demo-source.ts        mode démo, en mémoire
   │  └─ pg-source.ts          PostgreSQL (Supabase)
   ├─ repositories.ts        requêtes métier réutilisables
   ├─ dashboard.ts           agrégats KPI (marge nette, MRR, conversion)
   ├─ pricing/               moteur de tarification + calculateur de marge
   ├─ pdf/                   générateur PDF sans dépendance + gabarits
   ├─ integrations/          Claude, Perplexity, SIRENE, Vercel, Cloudflare,
   │                         Stripe, emailing, Ads, alertes
   ├─ pipeline/              prospection, génération de site, facturation
   └─ auth/                  session signée, TOTP, mot de passe scrypt

supabase/migrations/         schéma SQL complet + grille tarifaire
scripts/                     migrations, hash de mot de passe, secret TOTP
tests/                       33 tests Vitest
tooling/claude/              annexe Claude Code (voir plus bas)
```

Deux choix structurants :

**Un seul point de bascule démo/production.** Le choix de l'adaptateur se fait
dans `src/lib/db/index.ts` et nulle part ailleurs ; le reste du code ignore d'où
viennent les lignes. Les intégrations testent `config.demo` à un seul endroit
chacune.

**Zéro dépendance superflue.** Les graphiques, les PDF, le TOTP et la signature
de session sont écrits directement (SVG, `node:crypto`, Web Crypto). Les seules
dépendances de production sont Next, React, `postgres`, `stripe`, `zod` et le
SDK Anthropic.

### Modèle utilisé pour la génération

`ANTHROPIC_MODEL` vaut `claude-opus-5` par défaut. Pour un coût de production
encore plus bas, `claude-haiku-4-5` convient également — l'appel est identique,
seul le tarif change. Le coût réel de chaque génération est calculé à partir des
tokens consommés et stocké sur la version du site, ce qui rend la marge
affichée exacte quel que soit le modèle choisi.

---

## Scripts

| Commande | Effet |
| --- | --- |
| `npm run dev` | serveur de développement |
| `npm run build` / `npm start` | build et serveur de production |
| `npm run typecheck` | vérification TypeScript stricte |
| `npm test` | suite de tests Vitest |
| `npm run db:migrate` | applique les migrations SQL |
| `node scripts/hash-password.mjs "…"` | hash scrypt du mot de passe |
| `node scripts/totp-secret.mjs` | secret TOTP + URI `otpauth://` |

---

## Annexe Claude Code

`tooling/claude/` contient la configuration de **Claude Code**, l'outil de
développement — modèle par défaut sur Haiku, hook `PreModelSwitch` bloquant la
bascule vers Opus tant que le quota n'est pas réinitialisé, et serveur MCP
Perplexity pour les recherches de développement.

Ces fichiers modifient votre dossier personnel `~/.claude/` : ils sont
versionnés ici mais ne sont **pas** appliqués automatiquement. Voir
[`tooling/claude/README.md`](tooling/claude/README.md).
