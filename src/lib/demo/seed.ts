// ---------------------------------------------------------------------------
// Jeu de données fictives du mode démo.
// Volontairement cohérent : les prospects deviennent clients, les clients ont
// des sites, les sites ont un hébergement, un devis, une facture et parfois un
// abonnement. Les KPI du Dashboard sont donc réalistes sans aucune API réelle.
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import type { TableName } from '@/lib/db/schema';
import { OFFRES_PROMO_DEFAUT, PARAMETRES_DEFAUT, PRICING_RULES_DEFAUT } from './pricing-seed';

type Row = Record<string, unknown>;

const jour = 86_400_000;
const now = Date.now();
const iso = (joursAvant: number) => new Date(now - joursAvant * jour).toISOString();
const dateOnly = (joursAvant: number) =>
  new Date(now - joursAvant * jour).toISOString().slice(0, 10);

const id = () => randomUUID();

export function buildDemoData(): Partial<Record<TableName, Row[]>> {
  // --- Grille tarifaire ----------------------------------------------------
  const pricing_rules = PRICING_RULES_DEFAUT.map((r) => ({ id: id(), ...r }));
  const prix = (code: string) => pricing_rules.find((r) => r.code === code)!.prix;
  const offres_promo = OFFRES_PROMO_DEFAUT.map((o) => ({ id: id(), ...o }));

  // --- Clients -------------------------------------------------------------
  const clients = [
    {
      id: id(),
      prospect_id: null,
      raison_sociale: 'Boulangerie Le Fournil de Monts',
      contact_nom: 'Claire Bertin',
      email: 'contact@fournil-monts.fr',
      telephone: '02 47 26 11 04',
      siret: '80123456700018',
      secteur: 'Boulangerie-pâtisserie',
      adresse: '12 rue Mère-Dieu',
      code_postal: '37260',
      ville: 'Monts',
      stripe_customer_id: 'cus_demo_fournil',
      created_at: iso(96),
      updated_at: iso(6),
    },
    {
      id: id(),
      prospect_id: null,
      raison_sociale: 'Garage Verdier & Fils',
      contact_nom: 'Patrick Verdier',
      email: 'accueil@garage-verdier.fr',
      telephone: '02 47 53 88 20',
      siret: '49876543200027',
      secteur: 'Garage automobile',
      adresse: '5 avenue de la Gare',
      code_postal: '37250',
      ville: 'Veigné',
      stripe_customer_id: 'cus_demo_verdier',
      created_at: iso(74),
      updated_at: iso(11),
    },
    {
      id: id(),
      prospect_id: null,
      raison_sociale: 'Institut Belle Échappée',
      contact_nom: 'Sonia Mallet',
      email: 'contact@belle-echappee.fr',
      telephone: '02 47 34 62 19',
      siret: '84455667700013',
      secteur: 'Institut de beauté',
      adresse: '3 place du Marché',
      code_postal: '37170',
      ville: 'Chambray-lès-Tours',
      stripe_customer_id: 'cus_demo_echappee',
      created_at: iso(52),
      updated_at: iso(4),
    },
    {
      id: id(),
      prospect_id: null,
      raison_sociale: 'Menuiserie Loire Agencement',
      contact_nom: 'Hugo Rouzé',
      email: 'devis@loire-agencement.fr',
      telephone: '02 47 45 12 77',
      siret: '51122334400041',
      secteur: 'Menuiserie',
      adresse: '18 zone artisanale des Gués',
      code_postal: '37320',
      ville: 'Esvres',
      stripe_customer_id: 'cus_demo_loire',
      created_at: iso(31),
      updated_at: iso(2),
    },
    {
      id: id(),
      prospect_id: null,
      raison_sociale: 'Cabinet Ostéo Val de Cher',
      contact_nom: 'Léa Fauconnier',
      email: 'cabinet@osteo-valdecher.fr',
      telephone: '02 47 91 03 55',
      siret: '90011223300019',
      secteur: 'Santé / ostéopathie',
      adresse: '7 rue Nationale',
      code_postal: '37150',
      ville: 'Bléré',
      stripe_customer_id: null,
      created_at: iso(9),
      updated_at: iso(1),
    },
  ];

  // --- Prospects -----------------------------------------------------------
  const secteurs = [
    'Plomberie-chauffage',
    'Coiffure',
    'Restauration',
    'Électricité générale',
    'Fleuriste',
    'Paysagiste',
    'Maçonnerie',
    'Toiletteur canin',
    'Auto-école',
    'Cave à vins',
    'Peintre en bâtiment',
    'Serrurerie',
  ];
  const villes: [string, string][] = [
    ['Monts', '37260'],
    ['Montbazon', '37250'],
    ['Joué-lès-Tours', '37300'],
    ['Tours', '37000'],
    ['Saint-Avertin', '37550'],
    ['Ballan-Miré', '37510'],
    ['Amboise', '37400'],
    ['Loches', '37600'],
  ];
  const statutsProspect = ['non_vu', 'en_attente', 'client', 'refuse'] as const;

  const prospects = Array.from({ length: 34 }, (_, i) => {
    const [ville, cp] = villes[i % villes.length];
    const secteur = secteurs[i % secteurs.length];
    // Répartition réaliste : beaucoup de non-vus, peu de convertis.
    const statut =
      i % 11 === 0 ? 'client' : i % 7 === 0 ? 'refuse' : i % 3 === 0 ? 'en_attente' : 'non_vu';
    const obsolete = i % 4 !== 0;
    return {
      id: id(),
      raison_sociale: `${secteur.split(/[ -]/)[0]} ${['Durand', 'Petit', 'Moreau', 'Lefèvre', 'Girard', 'Chevalier', 'Roussel', 'Barbier'][i % 8]}`,
      siret: `${(40000000000000 + i * 137).toString()}`,
      siren: `${(400000000 + i * 137).toString()}`,
      secteur,
      code_naf: ['4321A', '9602A', '5610A', '4322B', '4776Z', '8130Z'][i % 6],
      adresse: `${1 + (i % 60)} rue ${['des Écoles', 'de la Paix', 'du Commerce', 'Nationale'][i % 4]}`,
      code_postal: cp,
      ville,
      departement: '37',
      email: `contact${i}@exemple-${ville.toLowerCase().replace(/[^a-z]/g, '')}.fr`,
      telephone: `02 47 ${10 + (i % 80)} ${10 + (i % 70)} ${10 + (i % 60)}`,
      site_web_existant: i % 3 === 0 ? null : `http://www.exemple-${i}.fr`,
      site_obsolete: obsolete,
      score: 40 + ((i * 7) % 60),
      statut: statutsProspect.includes(statut as never) ? statut : 'non_vu',
      // Comparateur concurrentiel : relevés Perplexity sur les agences locales.
      prix_concurrence_min: i % 2 === 0 ? 900 : 1500,
      prix_concurrence_max: i % 2 === 0 ? 2400 : 4200,
      source_concurrence: i % 2 === 0 ? 'Agences web Tours (Perplexity)' : 'Freelances 37 (Perplexity)',
      source: 'perplexity+sirene',
      notes_ia:
        obsolete
          ? 'Site existant non responsive, dernière mise à jour visible > 4 ans. Argument de refonte fort.'
          : 'Aucune présence web identifiée hors fiche Google Business.',
      created_at: iso(60 - (i % 55)),
      updated_at: iso(30 - (i % 28)),
    };
  });

  const prospects_history = prospects.slice(0, 22).map((p, i) => ({
    id: id(),
    siret: p.siret,
    raison_sociale: p.raison_sociale,
    canal: i % 3 === 0 ? 'telephone' : 'email',
    dernier_statut: p.statut,
    premier_contact: iso(70 - (i % 60)),
    dernier_contact: iso(20 - (i % 18)),
    nb_contacts: 1 + (i % 3),
  }));

  // --- Sites ---------------------------------------------------------------
  const sites = [
    {
      id: id(),
      client_id: clients[0].id,
      nom: 'Le Fournil de Monts',
      secteur: 'Boulangerie-pâtisserie',
      statut: 'production',
      url_test: 'https://fournil-monts-test.vercel.app',
      url_production: 'https://www.fournil-monts.fr',
      version_actuelle: 3,
      nb_pages: 6,
      options_actives: ['page_supplementaire', 'pack_visibilite'],
      cout_generation_ia: 5.8,
      derniere_generation: iso(60),
      mise_en_production_le: iso(58),
      created_at: iso(95),
      updated_at: iso(6),
    },
    {
      id: id(),
      client_id: clients[1].id,
      nom: 'Garage Verdier & Fils',
      secteur: 'Garage automobile',
      statut: 'production',
      url_test: 'https://garage-verdier-test.vercel.app',
      url_production: 'https://www.garage-verdier.fr',
      version_actuelle: 2,
      nb_pages: 5,
      options_actives: ['module_reservation'],
      cout_generation_ia: 6.4,
      derniere_generation: iso(48),
      mise_en_production_le: iso(46),
      created_at: iso(73),
      updated_at: iso(11),
    },
    {
      id: id(),
      client_id: clients[2].id,
      nom: 'Institut Belle Échappée',
      secteur: 'Institut de beauté',
      statut: 'maintenance',
      url_test: 'https://belle-echappee-test.vercel.app',
      url_production: 'https://www.belle-echappee.fr',
      version_actuelle: 4,
      nb_pages: 7,
      options_actives: ['module_reservation', 'page_supplementaire', 'refonte_premium'],
      cout_generation_ia: 8.2,
      derniere_generation: iso(12),
      mise_en_production_le: iso(40),
      created_at: iso(51),
      updated_at: iso(4),
    },
    {
      id: id(),
      client_id: clients[3].id,
      nom: 'Loire Agencement',
      secteur: 'Menuiserie',
      statut: 'test',
      url_test: 'https://loire-agencement-test.vercel.app',
      url_production: null,
      version_actuelle: 2,
      nb_pages: 5,
      options_actives: ['redaction_photo_ia'],
      cout_generation_ia: 4.9,
      derniere_generation: iso(3),
      mise_en_production_le: null,
      created_at: iso(30),
      updated_at: iso(2),
    },
    {
      id: id(),
      client_id: clients[4].id,
      nom: 'Ostéo Val de Cher',
      secteur: 'Santé / ostéopathie',
      statut: 'brouillon',
      url_test: null,
      url_production: null,
      version_actuelle: 1,
      nb_pages: 5,
      options_actives: [],
      cout_generation_ia: 0,
      derniere_generation: null,
      mise_en_production_le: null,
      created_at: iso(8),
      updated_at: iso(1),
    },
  ];

  const site_versions = sites.flatMap((site) =>
    Array.from({ length: site.version_actuelle }, (_, v) => ({
      id: id(),
      site_id: site.id,
      version: v + 1,
      libelle: v === 0 ? 'Génération initiale' : `Retouches client #${v}`,
      contenu: { pages: ['accueil', 'services', 'a-propos', 'galerie', 'contact'] },
      prompt_utilise: `Site vitrine ${site.secteur} — ${site.nom}`,
      modele_ia: 'claude-opus-5',
      cout_ia: Number((site.cout_generation_ia / site.version_actuelle).toFixed(4)),
      deploy_url: site.url_test,
      cree_par: 'ia',
      created_at: iso(70 - v * 6),
    })),
  );

  const validations_client = [
    {
      id: id(),
      site_id: sites[3].id,
      version: 2,
      token: 'demo-validation-loire-agencement',
      statut: 'envoyee',
      commentaire: null,
      envoye_le: iso(3),
      repondu_le: null,
      expire_le: new Date(now + 27 * jour).toISOString(),
    },
    {
      id: id(),
      site_id: sites[2].id,
      version: 4,
      token: 'demo-validation-belle-echappee',
      statut: 'modifications_demandees',
      commentaire: 'Merci de remonter les tarifs en page d’accueil et d’ajouter les horaires du samedi.',
      envoye_le: iso(14),
      repondu_le: iso(13),
      expire_le: new Date(now + 16 * jour).toISOString(),
    },
    {
      id: id(),
      site_id: sites[0].id,
      version: 3,
      token: 'demo-validation-fournil',
      statut: 'approuvee',
      commentaire: 'Parfait, on peut mettre en ligne.',
      envoye_le: iso(60),
      repondu_le: iso(59),
      expire_le: iso(30),
    },
  ];

  const hosting_instances = sites
    .filter((s) => s.statut !== 'brouillon')
    .map((site, i) => ({
      id: id(),
      site_id: site.id,
      plateforme: 'vercel',
      projet_externe_id: `prj_demo_${i + 1}`,
      domaine: site.url_production?.replace('https://', '') ?? null,
      sous_domaine: `${site.nom.toLowerCase().replace(/[^a-z]+/g, '-')}.siteforge.ai`,
      statut_ssl: site.url_production ? 'actif' : 'en_attente',
      dns_configure: Boolean(site.url_production),
      cout_mensuel_reel: 0.38 + i * 0.07,
      prix_facture_mensuel: site.statut === 'test' ? 0 : 19,
      derniere_verification: iso(1),
      created_at: site.created_at,
      updated_at: iso(1),
    }));

  // --- Devis, factures, abonnements ---------------------------------------
  const ligne = (code: string, quantite = 1) => {
    const rule = pricing_rules.find((r) => r.code === code)!;
    return {
      code: rule.code,
      nom: rule.nom,
      type: rule.type,
      prix_unitaire: rule.prix,
      quantite,
      total: Number((rule.prix * quantite).toFixed(2)),
    };
  };

  type DevisSeed = {
    client: number;
    site: number;
    lignes: { code: string; q?: number }[];
    statut: string;
    jours: number;
    ads: number;
  };

  const devisSeeds: DevisSeed[] = [
    {
      client: 0,
      site: 0,
      lignes: [{ code: 'base_site_essentiel' }, { code: 'page_supplementaire', q: 1 }, { code: 'pack_visibilite' }, { code: 'abo_hebergement' }],
      statut: 'accepte',
      jours: 92,
      ads: 18,
    },
    {
      client: 1,
      site: 1,
      lignes: [{ code: 'base_site_essentiel' }, { code: 'module_reservation' }, { code: 'abo_hebergement' }],
      statut: 'accepte',
      jours: 70,
      ads: 23,
    },
    {
      client: 2,
      site: 2,
      lignes: [
        { code: 'base_site_essentiel' },
        { code: 'module_reservation' },
        { code: 'page_supplementaire', q: 2 },
        { code: 'refonte_premium' },
        { code: 'abo_hebergement' },
      ],
      statut: 'accepte',
      jours: 49,
      ads: 12,
    },
    {
      client: 3,
      site: 3,
      lignes: [{ code: 'base_site_essentiel' }, { code: 'redaction_photo_ia' }, { code: 'abo_hebergement' }],
      statut: 'envoye',
      jours: 12,
      ads: 27,
    },
    {
      client: 4,
      site: 4,
      lignes: [{ code: 'base_site_essentiel' }, { code: 'livraison_express' }, { code: 'abo_hebergement' }],
      statut: 'brouillon',
      jours: 2,
      ads: 0,
    },
  ];

  const devis = devisSeeds.map((seed, i) => {
    const lignes = seed.lignes.map((l) => ligne(l.code, l.q ?? 1));
    const abo = lignes.filter((l) => l.type === 'abonnement');
    const oneshot = lignes.filter((l) => l.type !== 'abonnement');
    const total_oneshot = oneshot.reduce((s, l) => s + l.total, 0);
    const total_mensuel = abo.reduce((s, l) => s + l.total, 0);
    const cout_ia = oneshot.reduce((s, l) => {
      const rule = pricing_rules.find((r) => r.code === l.code)!;
      return s + rule.cout_ia_estime * l.quantite;
    }, 0);
    const cout_heb = lignes.reduce((s, l) => {
      const rule = pricing_rules.find((r) => r.code === l.code)!;
      return s + rule.cout_hebergement_mensuel * l.quantite;
    }, 0);
    const marge_oneshot = total_oneshot - cout_ia - seed.ads;
    const marge_mensuelle = total_mensuel - cout_heb;
    return {
      id: id(),
      numero: `DEV-2026-${String(i + 1).padStart(4, '0')}`,
      client_id: clients[seed.client].id,
      site_id: sites[seed.site].id,
      options_selectionnees: lignes,
      promo_code: null,
      total_oneshot,
      total_mensuel,
      remise: 0,
      total: total_oneshot,
      cout_ia_estime: Number(cout_ia.toFixed(4)),
      cout_hebergement_estime: Number(cout_heb.toFixed(4)),
      cout_acquisition_ads: seed.ads,
      marge_oneshot: Number(marge_oneshot.toFixed(2)),
      marge_oneshot_pct: total_oneshot > 0 ? Number(((marge_oneshot / total_oneshot) * 100).toFixed(2)) : 0,
      marge_mensuelle: Number(marge_mensuelle.toFixed(2)),
      alerte_marge: false,
      statut: seed.statut,
      pdf_url: null,
      envoye_le: seed.statut === 'brouillon' ? null : iso(seed.jours),
      accepte_le: seed.statut === 'accepte' ? iso(seed.jours - 2) : null,
      valide_jusqu_au: dateOnly(seed.jours - 30),
      created_at: iso(seed.jours),
      updated_at: iso(seed.jours - 2),
    };
  });

  const abonnements = devis
    .filter((d) => d.statut === 'accepte' && d.total_mensuel > 0)
    .map((d, i) => ({
      id: id(),
      client_id: d.client_id,
      site_id: d.site_id,
      pricing_rule_code: 'abo_hebergement',
      prix_mensuel: d.total_mensuel,
      promo_code: i === 2 ? 'LANCEMENT30' : null,
      statut: i === 1 ? 'en_echec' : 'actif',
      statut_stripe: i === 1 ? 'past_due' : 'active',
      stripe_subscription_id: `sub_demo_${i + 1}`,
      prochaine_echeance: dateOnly(-(5 + i * 4)),
      echecs_paiement: i === 1 ? 1 : 0,
      suspendu_le: null,
      created_at: d.accepte_le,
      updated_at: iso(2),
    }));

  const factures: Row[] = [];
  let numeroFacture = 1;
  const pushFacture = (row: Row) => {
    factures.push({
      id: id(),
      numero: `FAC-2026-${String(numeroFacture++).padStart(4, '0')}`,
      tva: 0,
      ...row,
    });
  };

  // Facture de prestation initiale pour chaque devis accepté.
  for (const d of devis.filter((x) => x.statut === 'accepte')) {
    pushFacture({
      devis_id: d.id,
      client_id: d.client_id,
      abonnement_id: null,
      lignes: d.options_selectionnees.filter((l) => l.type !== 'abonnement'),
      total_ht: d.total_oneshot,
      total_ttc: d.total_oneshot,
      statut_paiement: 'payee',
      moyen_paiement: 'stripe',
      stripe_payment_intent: `pi_demo_${numeroFacture}`,
      date: d.accepte_le!.slice(0, 10),
      date_echeance: d.accepte_le!.slice(0, 10),
      date_paiement: d.accepte_le,
      pdf_url: null,
      created_at: d.accepte_le,
      updated_at: d.accepte_le,
    });
  }

  // Échéances mensuelles d'abonnement sur les 3 derniers mois.
  for (const abo of abonnements) {
    for (let m = 3; m >= 1; m--) {
      const impayee = abo.statut === 'en_echec' && m === 1;
      pushFacture({
        devis_id: null,
        client_id: abo.client_id,
        abonnement_id: abo.id,
        lignes: [ligne('abo_hebergement')],
        total_ht: abo.prix_mensuel,
        total_ttc: abo.prix_mensuel,
        statut_paiement: impayee ? 'impayee' : 'payee',
        moyen_paiement: 'stripe',
        stripe_payment_intent: `pi_demo_abo_${abo.id.slice(0, 6)}_${m}`,
        date: dateOnly(m * 30),
        date_echeance: dateOnly(m * 30),
        date_paiement: impayee ? null : iso(m * 30),
        pdf_url: null,
        created_at: iso(m * 30),
        updated_at: iso(m * 30),
      });
    }
  }

  // Facture en attente pour le devis envoyé mais pas encore accepté.
  const devisEnvoye = devis.find((d) => d.statut === 'envoye');
  if (devisEnvoye) {
    pushFacture({
      devis_id: devisEnvoye.id,
      client_id: devisEnvoye.client_id,
      abonnement_id: null,
      lignes: devisEnvoye.options_selectionnees.filter((l) => l.type !== 'abonnement'),
      total_ht: devisEnvoye.total_oneshot,
      total_ttc: devisEnvoye.total_oneshot,
      statut_paiement: 'emise',
      moyen_paiement: null,
      stripe_payment_intent: null,
      date: dateOnly(6),
      date_echeance: dateOnly(-9),
      date_paiement: null,
      pdf_url: null,
      created_at: iso(6),
      updated_at: iso(6),
    });
  }

  const historique_prix = devis.flatMap((d) =>
    d.options_selectionnees.map((l) => ({
      id: id(),
      client_id: d.client_id,
      devis_id: d.id,
      pricing_code: l.code,
      libelle: l.nom,
      prix_applique: l.prix_unitaire,
      prix_grille: prix(l.code),
      quantite: l.quantite,
      motif: 'Devis initial',
      applique_le: d.created_at,
    })),
  );

  // --- Publicité -----------------------------------------------------------
  const campagnes_ads = [
    {
      id: id(),
      plateforme: 'meta',
      nom: 'Artisans 37 — Site vitrine 249 €',
      statut: 'active',
      budget: 300,
      depense: 214.6,
      leads: 31,
      conversions: 3,
      revenus_attribues: 1094,
      date_debut: dateOnly(45),
      date_fin: null,
      created_at: iso(45),
      updated_at: iso(1),
    },
    {
      id: id(),
      plateforme: 'google',
      nom: 'Recherche — création site internet Tours',
      statut: 'active',
      budget: 250,
      depense: 188.2,
      leads: 19,
      conversions: 2,
      revenus_attribues: 736,
      date_debut: dateOnly(38),
      date_fin: null,
      created_at: iso(38),
      updated_at: iso(1),
    },
    {
      id: id(),
      plateforme: 'meta',
      nom: 'Retargeting — devis non signés',
      statut: 'en_pause',
      budget: 120,
      depense: 61.4,
      leads: 8,
      conversions: 0,
      revenus_attribues: 0,
      date_debut: dateOnly(22),
      date_fin: dateOnly(4),
      created_at: iso(22),
      updated_at: iso(4),
    },
  ];

  // --- Emailing ------------------------------------------------------------
  const emails_envoyes = prospects.slice(0, 18).map((p, i) => ({
    id: id(),
    prospect_id: p.id,
    client_id: null,
    destinataire: p.email,
    sujet: `Votre visibilité en ligne — ${p.raison_sociale}`,
    gabarit: i % 2 === 0 ? 'prospection_initiale' : 'relance_1',
    statut: 'envoye',
    ouvert: i % 3 !== 0,
    clique: i % 5 === 0,
    token_desinscription: `unsub-demo-${i}`,
    provider_id: `msg_demo_${i}`,
    envoye_le: iso(25 - (i % 24)),
  }));

  const unsubscribed_emails = [
    {
      email: prospects[4].email,
      motif: 'Demande explicite du destinataire',
      source: 'lien_desinscription',
      desinscrit_le: iso(12),
    },
    {
      email: prospects[9].email,
      motif: 'Retour par réponse à l’email',
      source: 'manuel',
      desinscrit_le: iso(5),
    },
  ];

  const recherches_perplexity = [
    {
      id: id(),
      requete: 'artisans sans site web Indre-et-Loire',
      secteur: 'Artisanat',
      zone: '37 — Indre-et-Loire',
      modele: 'sonar',
      nb_resultats: 24,
      cout_estime: 0.018,
      reponse_brute: null,
      created_at: iso(3),
    },
    {
      id: id(),
      requete: 'prix création site vitrine agence Tours 2026',
      secteur: null,
      zone: 'Tours',
      modele: 'sonar',
      nb_resultats: 9,
      cout_estime: 0.011,
      reponse_brute: null,
      created_at: iso(2),
    },
  ];

  const notes = [
    {
      id: id(),
      client_id: clients[0].id,
      prospect_id: null,
      auteur: 'axel',
      contenu: 'Souhaite ajouter la commande de pains spéciaux en ligne au printemps — upsell boutique 199 €.',
      created_at: iso(20),
    },
    {
      id: id(),
      client_id: clients[1].id,
      prospect_id: null,
      auteur: 'axel',
      contenu: 'Carte bancaire expirée, relance Stripe en cours. Suspendre le site sous 15 jours si impayé.',
      created_at: iso(6),
    },
    {
      id: id(),
      client_id: clients[2].id,
      prospect_id: null,
      auteur: 'axel',
      contenu: 'Retouches demandées sur la v4 : horaires du samedi + tarifs en page d’accueil.',
      created_at: iso(13),
    },
  ];

  return {
    prospects,
    prospects_history,
    clients,
    notes,
    sites,
    site_versions,
    validations_client,
    hosting_instances,
    pricing_rules,
    offres_promo,
    devis,
    factures,
    abonnements,
    campagnes_ads,
    emails_envoyes,
    unsubscribed_emails,
    recherches_perplexity,
    historique_prix,
    parametres: PARAMETRES_DEFAUT.map((p) => ({ ...p, updated_at: iso(0) })),
  };
}

/**
 * Amorçage de production : la configuration seule.
 *
 * Grille tarifaire, offres de lancement et seuils de marge sont des réglages,
 * pas des données commerciales — ils doivent exister au premier démarrage.
 * Aucun prospect, client, site, devis ni facture n'est créé : ces tables se
 * remplissent avec votre activité réelle.
 */
export function donneesInitiales(): Partial<Record<TableName, Row[]>> {
  const maintenant = new Date().toISOString();
  return {
    pricing_rules: PRICING_RULES_DEFAUT.map((regle) => ({
      id: randomUUID(),
      ...regle,
      created_at: maintenant,
      updated_at: maintenant,
    })),
    offres_promo: OFFRES_PROMO_DEFAUT.map((offre) => ({
      id: randomUUID(),
      ...offre,
      // Aucune promotion active par défaut : c'est une décision commerciale.
      actif: false,
      created_at: maintenant,
    })),
    parametres: PARAMETRES_DEFAUT.map((parametre) => ({ ...parametre, updated_at: maintenant })),
  };
}
