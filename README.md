# SiteForge AI

Application de pilotage d'une microentreprise de création de sites web pour
TPE, artisans et commerçants : **prospection → génération IA → validation client
→ hébergement → facturation**, entièrement automatisée et pilotée depuis une
seule interface mono-utilisateur.

L'application **démarre en production** : vos données sont réelles et
persistantes dès le premier lancement, sans base de données à provisionner.

```bash
npm install
npm run dev     # http://localhost:3000 — vous choisissez votre mot de passe au premier écran
```

## Sommaire

- [Démarrage](#démarrage)
- [Modules](#modules)
- [Notifications](#notifications)
- [Sauvegarde unique par site](#sauvegarde-unique-par-site)
- [Moteur de tarification](#moteur-de-tarification)
- [Pipeline de génération](#pipeline-de-génération)
- [Conformité RGPD](#conformité-rgpd)
- [Stockage et intégrations](#stockage-et-intégrations)
- [Architecture](#architecture)
- [Scripts](#scripts)
- [Annexe Claude Code](#annexe-claude-code)

---

## Démarrage

```bash
npm install
npm run dev
```

Au premier lancement, l'écran de connexion vous demande de **choisir votre mot
de passe** (10 caractères minimum). Il est haché en scrypt et conservé avec vos
données ; la route qui le définit se verrouille ensuite définitivement, de sorte
que personne ne peut reprendre la main sur une installation déjà configurée.

Vos données sont écrites dans `.data/siteforge.json` et survivent aux
redémarrages. Aucune clé d'API n'est nécessaire pour démarrer : chaque
intégration reste facultative, et son absence désactive uniquement la fonction
correspondante — en le disant clairement plutôt qu'en simulant un succès.

### Mode démo

Pour explorer l'application avec un jeu de données fictives, sans conséquence :

```bash
DEMO_MODE=true npm run dev     # mot de passe : demo
```

Les données sont alors en mémoire et disparaissent au redémarrage.

### Vérifications

```bash
npm run typecheck   # tsc --noEmit
npm test            # 125 tests (+12 sur PostgreSQL, voir ci-dessous)
npm run build       # build de production
```

## Modules

| Page | Contenu |
| --- | --- |
| **Dashboard** | Clients démarchés, taux de conversion, revenus jour/semaine/mois, sites réalisés et actifs, sites en attente de validation, **marge nette moyenne par site**, **MRR** des abonnements, revenus Ads, devis sous les seuils de marge |
| **Recherche client** | Filtres secteur / code postal, recherche croisée SIRENE + Perplexity, workflow à 4 emojis 🕐 ⏳ ✅ ❌, déduplication par SIRET, relevé des prix de la concurrence locale |
| **Clients** | Saisie manuelle ou conversion d'un prospect. Fiche CRM : coordonnées, SIRET, rentabilité du compte, sites, devis, factures, abonnement, notes — et la génération de site en un clic |
| **Sites créés** | Statuts brouillon / test / production / maintenance / hors ligne, **production courante et sauvegarde unique** restaurable en un clic, suivi des validations client |
| **Facturation & tarification** | Configurateur de devis instantané, calculateur de marge en temps réel, devis, factures, abonnements récurrents |
| **Hébergement** | Vue consolidée par site : plateforme, domaine, statut SSL, DNS, coût réel mensuel **comparé au prix facturé** |
| **Publicité** | Meta Ads et Google Ads en lecture : budget, dépensé, leads, coût/lead, conversions, revenus attribués, ROAS |
| **Notifications** | Journal des événements : emails reçus et envoyés, clients confirmés, validations, paiements, alertes de marge |
| **Paramètres** | Grille tarifaire éditable, offres de lancement, seuils de marge, **état réel de chaque intégration**, rappel RGPD |

Deux pages publiques, destinées au client final et non protégées par
l'authentification :

- `/validation/<token>` — boutons « j'approuve » / « je souhaite des modifications »
- `/desinscription/<token>` — désinscription en un clic

---

## Notifications

Une cloche dans la barre de navigation affiche le nombre d'événements non lus.
Chaque notification décrit un fait déjà arrivé et pointe vers l'écran où agir.

| Événement | Déclencheur |
| --- | --- |
| 📥 Email reçu | Formulaire de contact d'un site livré, ou réponse d'un prospect |
| 📤 Email envoyé | Prospection, demande de validation, envoi de devis |
| ✅ Client confirmé | Un prospect passe au statut ✅ et sa fiche CRM est créée |
| 👍 Site approuvé | Le client valide sa maquette |
| ✏️ Modifications demandées | Le client demande des retouches, avec son commentaire |
| 🚀 Mise en production | Site publié, devis et facture générés |
| 🧾 Devis accepté | Facture émise et abonnement ouvert |
| 💶 Paiement encaissé | Webhook Stripe ou pointage manuel |
| ⚠️ Paiement échoué | Prélèvement refusé, relance automatique |
| ⛔ Abonnement suspendu | Site mis hors ligne après 3 échecs |
| 📉 Alerte de marge | Un devis passe sous un seuil configuré |
| 🔎 Prospects trouvés | Une recherche a ajouté des prospects |

Les événements marqués urgents partent aussi vers Telegram ou Slack, s'ils sont
configurés — la cloche vous informe quand vous êtes devant l'écran, les alertes
temps réel quand vous n'y êtes pas.

Les notifications lues sont purgées au bout de 30 jours
(`NOTIFICATIONS_RETENTION_JOURS`). Une notification qui échoue n'interrompt
jamais l'action métier qui l'a déclenchée : un paiement encaissé reste encaissé
même si la cloche ne s'allume pas.

### Emails entrants

Pour recevoir les réponses de vos prospects dans la cloche, branchez le webhook
de votre fournisseur sur `POST /api/email/entrant` (Resend : `email.received`,
Brevo : `inbound`). Le message est rattaché à la fiche client ou prospect
correspondante et journalisé en note.

---

## Sauvegarde unique par site

Un site ne conserve jamais plus de deux états :

```
production courante  ←  ce que voit le client
sauvegarde           ←  l'état précédent, et lui seul
```

À chaque modification, la production courante descend en sauvegarde — elle
écrase l'ancienne — et la nouvelle version prend sa place. Le bouton
**Restaurer** échange les deux ; restaurer deux fois de suite revient au point
de départ, ce qui rend l'opération sans risque même déclenchée par erreur.

Ce choix est délibérément plus pauvre qu'un historique complet. Deux états se
raisonnent de tête, se testent exhaustivement, et ne laissent pas s'accumuler
des versions intermédiaires dont plus personne ne sait si elles sont déployées.
Un retour en arrière est toujours à un clic, jamais à « laquelle des sept ? ».

Les versions excédentaires sont supprimées automatiquement (`src/lib/pipeline/sauvegarde.ts`),
et la migration `0004` aligne une base existante sur cette règle.

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

Chaque génération crée une version avec son coût IA réel, ce qui rend la
restauration possible et la marge par site vérifiable.

Les pages attendues sont **nommées explicitement** dans le prompt (accueil,
services, à-propos, réalisations, contact…) et le site produit est **contrôlé**
avant d'être livré : pages manquantes et liens de menu sans cible sont
détectés. Une page absente déclenche un second appel ciblé sur elle seule ;
ce qui subsiste est signalé en clair plutôt que livré en silence — un site dont
le menu mène à des 404 n'est pas vendable.

**Une génération payée n'est jamais perdue.** La version est enregistrée dès
que l'IA a répondu, avant toute étape qui peut échouer. Un déploiement en panne
ou un email qui ne part pas deviennent des avertissements, jamais une erreur qui
emporte le travail : le site reste consultable et se déploie ensuite d'un clic.

**La génération n'exige que la clé Anthropic.** Un site généré avant que Vercel
ne soit configuré se met en ligne ensuite d'un clic (**Déployer en test**),
sans nouvel appel à l'IA — donc sans être repayé.

 L'hébergement est une étape
distincte : sans jeton Vercel, le site est bien généré et consultable en
**aperçu local** (`/apercu/<id>`), mais rien n'est envoyé au client — une
demande de validation n'a de sens que si le client peut ouvrir le site. Le HTML
produit par l'IA est servi sous `Content-Security-Policy: sandbox`, donc une
page générée ne peut ni lire votre session ni appeler l'API.

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

## Stockage et intégrations

### Stockage

L'adaptateur est choisi à un seul endroit (`src/lib/db/index.ts`) :

| Condition | Stockage |
| --- | --- |
| `DATABASE_URL` renseigné | PostgreSQL (Supabase) — recommandé en ligne |
| sinon | Fichier `.data/siteforge.json`, persistant |
| `DEMO_MODE=true` | Mémoire volatile, données fictives |

Le fichier local contient votre comptabilité et vos identifiants : sauvegardez-le
comme tel. Pour passer sur PostgreSQL :

Renseignez `DATABASE_URL` dans `.env.local`, puis :

```bash
npm run db:migrate
```

En cas de doute, `npm run db:check` montre comment la chaîne est réellement
interprétée — serveur, port, base — et tente la connexion.

La chaîne se copie depuis Supabase : **Project Settings → Database →
Connection string → URI**. Remplacez `[YOUR-PASSWORD]` par votre mot de passe,
crochets compris — les laisser produit une erreur de résolution DNS
incompréhensible, que l'application intercepte désormais pour vous le dire.

Les migrations sont idempotentes et suivies dans une table `_migrations`.

### Intégrations

Chacune est facultative. Sans sa clé, seule la fonction correspondante est
indisponible — et l'application le dit en nommant la variable à renseigner,
plutôt que de simuler un succès. La page **Paramètres** affiche l'état réel de
chaque intégration.

| Capacité | Variables | Sans elle |
| --- | --- | --- |
| Génération de sites par IA | `ANTHROPIC_API_KEY` | Impossible de générer un site |
| Recherche et veille web | `PERPLEXITY_API_KEY` | Recherche limitée à l'annuaire SIRENE |
| Hébergement automatisé | `VERCEL_TOKEN` | Sites générés et consultables en aperçu, mais non déployés |
| Domaine et SSL | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID` | Site publié sur son URL Vercel, sans domaine |
| Encaissement | `STRIPE_SECRET_KEY` | Devis et factures générés, réglés hors ligne |
| Envoi d'emails | `RESEND_API_KEY` ou `BREVO_API_KEY` | Aucun email ne part ; les demandes de validation sont créées et leur lien vous est donné à transmettre |
| Statistiques publicitaires | `META_ADS_TOKEN` | Pas de synchronisation des campagnes |

### Sécurité

Le mot de passe choisi au premier écran est haché en scrypt. Pour un
déploiement en ligne, préférez les variables d'environnement, qui ont priorité :

```bash
node scripts/hash-password.mjs "votreMotDePasse"   # → AUTH_PASSWORD_HASH=…
node scripts/totp-secret.mjs contact@siteforgeai.fr  # → AUTH_TOTP_SECRET=… + QR otpauth://
```

Renseigner `AUTH_TOTP_SECRET` rend la 2FA obligatoire. Générez aussi un
`SESSION_SECRET` aléatoire d'au moins 32 caractères — un bandeau rouge vous
avertit tant que la valeur d'exemple est en place en production.

### Héberger l'application

Tant que l'application tourne sur votre machine, vos clients ne peuvent pas
ouvrir leurs liens de validation. Pour la déployer :

1. **PostgreSQL d'abord.** Sur Vercel, Netlify ou AWS Lambda, le système de
   fichiers est éphémère : le stockage fichier y donne l'illusion de
   fonctionner puis efface tout au déploiement suivant. L'application **refuse**
   donc de démarrer sur ces plateformes sans `DATABASE_URL` — une comptabilité
   perdue en silence serait pire qu'un refus.
2. `npm run db:migrate` avec cette `DATABASE_URL`.
3. Déployer, en renseignant toutes les variables dans les réglages de la
   plateforme, `APP_BASE_URL` pointant sur l'adresse publique obtenue.

`vercel.json` force la détection du framework : sans lui, Vercel prend le
projet pour un site statique et cherche un dossier `public`.

### Tester contre PostgreSQL

Douze tests couvrent l'adaptateur PostgreSQL — sérialisation `jsonb`, types
énumérés, conversion des `numeric` que PostgreSQL renvoie en chaînes. Ils sont
ignorés par défaut pour que la suite tourne sans infrastructure, et s'activent
avec une base de test :

```bash
TEST_DATABASE_URL=postgresql://postgres@localhost:5432/siteforge_test npm test
```

La base doit avoir été migrée au préalable.

### Joindre vos clients

`APP_BASE_URL` est l'adresse à laquelle **vos clients** joignent l'application :
les liens de validation des sites en sont construits. Tant qu'elle vaut
`localhost`, ces liens ne fonctionnent que sur votre machine — l'application
vous en avertit à chaque envoi. Pour travailler avec de vrais clients,
hébergez l'application et renseignez son adresse publique.

### Webhook Stripe

Pointez-le sur `POST /api/stripe/webhook` et renseignez `STRIPE_WEBHOOK_SECRET`.
Événements traités : `checkout.session.completed` et `invoice.paid`
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
   │  ├─ file-source.ts        fichier JSON persistant (production par défaut)
   │  ├─ pg-source.ts          PostgreSQL (Supabase)
   │  └─ demo-source.ts        mémoire volatile (mode démo)
   ├─ repositories.ts        requêtes métier réutilisables
   ├─ dashboard.ts           agrégats KPI (marge nette, MRR, conversion)
   ├─ notifications.ts       journal d'événements (logique serveur)
   ├─ notifications-types.ts types et présentation, sans dépendance
   ├─ pricing/               moteur de tarification + calculateur de marge
   ├─ pdf/                   générateur PDF sans dépendance + gabarits
   ├─ integrations/          Claude, Perplexity, SIRENE, Vercel, Cloudflare,
   │                         Stripe, emailing, Ads, alertes
   ├─ pipeline/              prospection, génération de site, facturation,
   │                         sauvegarde unique
   └─ auth/                  session signée, TOTP, identifiants scrypt

supabase/migrations/         schéma SQL complet + grille tarifaire
scripts/                     migrations, hash de mot de passe, secret TOTP
tests/                       125 tests Vitest (+12 sur PostgreSQL)
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

**Aucun succès simulé.** En production, une intégration non configurée refuse
l'action en nommant la variable manquante. Montrer à un client un site
« déployé » qui n'existe pas serait la pire des issues : mieux vaut un refus
explicite qu'une illusion.

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
| `npm test` | suite de tests Vitest (125 tests) |
| `npm run db:check` | diagnostique la connexion à la base, mot de passe masqué |
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
