// ---------------------------------------------------------------------------
// Module Facturation & tarification : configurateur de devis instantané,
// calculateur de marge, émission des factures et abonnements récurrents.
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { config } from '@/lib/config';
import { db } from '@/lib/db';
import { alerter } from '@/lib/integrations/alertes';
import { coutAcquisitionMoyen } from '@/lib/integrations/ads';
import { creerAbonnement, creerOuRecupererClient, creerPaiementUnique } from '@/lib/integrations/stripe';
import { analyserMarge, type AnalyseMarge, type SeuilsMarge } from '@/lib/pricing/margin';
import {
  calculerTarification,
  selectionDepuisSite,
  type SelectionOption,
  type Tarification,
} from '@/lib/pricing/engine';
import {
  getOffresPromo,
  getParametreNombre,
  getPricingRules,
  prochainNumero,
} from '@/lib/repositories';
import type { Abonnement, Client, Devis, Facture, Site } from '@/lib/types';

export async function seuilsMarge(): Promise<SeuilsMarge> {
  const [oneshotPct, abonnementEur] = await Promise.all([
    getParametreNombre('marge_min_oneshot_pct', 70),
    getParametreNombre('marge_min_abonnement_eur', 12),
  ]);
  return { oneshotPct, abonnementEur };
}

export interface Simulation {
  tarification: Tarification;
  marge: AnalyseMarge;
  seuils: SeuilsMarge;
}

/**
 * Cœur du configurateur : calcule prix et marge en temps réel.
 * Appelée à chaque frappe côté UI et avant chaque enregistrement de devis,
 * ce qui garantit que l'affichage et l'enregistrement ne divergent jamais.
 */
export async function simuler(params: {
  options: SelectionOption[];
  promoCode?: string | null;
  coutAcquisitionAds?: number;
}): Promise<Simulation> {
  const [regles, promos, seuils] = await Promise.all([
    getPricingRules(),
    getOffresPromo(),
    seuilsMarge(),
  ]);

  const coutAds = params.coutAcquisitionAds ?? (await coutAcquisitionMoyen());
  const tarification = calculerTarification(
    { options: params.options, promoCode: params.promoCode, coutAcquisitionAds: coutAds },
    regles,
    promos,
  );

  return { tarification, marge: analyserMarge(tarification, seuils), seuils };
}

/** Crée un devis à partir d'une sélection d'options, marge figée à l'émission. */
export async function creerDevis(params: {
  clientId: string;
  siteId?: string | null;
  options: SelectionOption[];
  promoCode?: string | null;
  coutAcquisitionAds?: number;
  statut?: 'brouillon' | 'envoye';
}): Promise<{ devis: Devis; simulation: Simulation }> {
  const client = await db.get<Client>('clients', params.clientId);
  if (!client) throw new Error('Client introuvable.');

  const simulation = await simuler(params);
  const { tarification, marge } = simulation;
  const validiteJours = await getParametreNombre('validite_devis_jours', 30);

  const maintenant = new Date();
  const validite = new Date(maintenant.getTime() + validiteJours * 86_400_000);
  const statut = params.statut ?? 'brouillon';

  const devis = await db.insert<Devis>('devis', {
    numero: await prochainNumero('DEV'),
    client_id: params.clientId,
    site_id: params.siteId ?? null,
    options_selectionnees: tarification.lignes,
    promo_code: tarification.promo?.code ?? null,
    total_oneshot: tarification.totalOneshot,
    total_mensuel: tarification.totalMensuel,
    remise: tarification.remiseOneshot,
    total: tarification.totalOneshot,
    cout_ia_estime: tarification.coutIa,
    cout_hebergement_estime: tarification.coutHebergementMensuel,
    cout_acquisition_ads: tarification.coutAcquisitionAds,
    marge_oneshot: marge.margeOneshot,
    marge_oneshot_pct: marge.margeOneshotPct,
    marge_mensuelle: marge.margeMensuelle,
    alerte_marge: marge.alerte,
    statut,
    pdf_url: null,
    envoye_le: statut === 'envoye' ? maintenant.toISOString() : null,
    accepte_le: null,
    valide_jusqu_au: validite.toISOString().slice(0, 10),
  });

  // Historique des prix appliqués : on garde la trace même si la grille évolue.
  const regles = await getPricingRules(false);
  for (const ligne of tarification.lignes) {
    const regle = regles.find((r) => r.code === ligne.code);
    await db.insert('historique_prix', {
      client_id: params.clientId,
      devis_id: devis.id,
      pricing_code: ligne.code,
      libelle: ligne.nom,
      prix_applique: ligne.prix_unitaire,
      prix_grille: regle?.prix ?? ligne.prix_unitaire,
      quantite: ligne.quantite,
      motif: tarification.promo ? `Devis avec offre ${tarification.promo.code}` : 'Devis',
      applique_le: maintenant.toISOString(),
    });
  }

  if (marge.alerte) {
    await alerter(
      `⚠️ Devis ${devis.numero} (${client.raison_sociale}) sous les seuils de marge : ${marge.alertes.join(' ')}`,
    );
  }

  return { devis, simulation };
}

/** Devis automatique déduit du site : pages réellement générées + options actives. */
export async function creerDevisDepuisSite(siteId: string): Promise<{ devis: Devis; simulation: Simulation }> {
  const site = await db.get<Site>('sites', siteId);
  if (!site) throw new Error('Site introuvable.');

  return creerDevis({
    clientId: site.client_id,
    siteId: site.id,
    options: selectionDepuisSite(site.nb_pages, site.options_actives ?? []),
    statut: 'envoye',
  });
}

/** Transforme un devis accepté en facture, puis ouvre l'abonnement mensuel. */
export async function facturerDevis(devisId: string): Promise<{
  facture: Facture;
  abonnement: Abonnement | null;
  lienPaiement: string | null;
}> {
  const devis = await db.get<Devis>('devis', devisId);
  if (!devis) throw new Error('Devis introuvable.');
  const client = await db.get<Client>('clients', devis.client_id);
  if (!client) throw new Error('Client introuvable.');

  const dejaFacture = await db.findOne<Facture>('factures', { devis_id: devisId });
  if (dejaFacture) {
    const abo = await db.findOne<Abonnement>('abonnements', { client_id: devis.client_id });
    return { facture: dejaFacture, abonnement: abo, lienPaiement: null };
  }

  const lignesOneshot = devis.options_selectionnees.filter((l) => l.type !== 'abonnement');
  const lignesAbo = devis.options_selectionnees.filter((l) => l.type === 'abonnement');
  const maintenant = new Date();

  const facture = await db.insert<Facture>('factures', {
    numero: await prochainNumero('FAC'),
    devis_id: devis.id,
    client_id: devis.client_id,
    abonnement_id: null,
    lignes: lignesOneshot,
    total_ht: devis.total_oneshot,
    // Microentreprise : franchise en base de TVA.
    tva: 0,
    total_ttc: devis.total_oneshot,
    statut_paiement: 'emise',
    moyen_paiement: null,
    stripe_payment_intent: null,
    date: maintenant.toISOString().slice(0, 10),
    date_echeance: new Date(maintenant.getTime() + 15 * 86_400_000).toISOString().slice(0, 10),
    date_paiement: null,
    pdf_url: null,
  });

  let abonnement: Abonnement | null = null;
  if (devis.total_mensuel > 0) {
    const prochaine = new Date(maintenant.getTime() + 30 * 86_400_000);
    abonnement = await db.insert<Abonnement>('abonnements', {
      client_id: devis.client_id,
      site_id: devis.site_id,
      pricing_rule_code: lignesAbo[0]?.code ?? 'abo_hebergement',
      prix_mensuel: devis.total_mensuel,
      promo_code: devis.promo_code,
      statut: 'actif',
      statut_stripe: config.demo ? 'demo' : null,
      stripe_subscription_id: config.demo ? `sub_demo_${randomUUID().slice(0, 8)}` : null,
      prochaine_echeance: prochaine.toISOString().slice(0, 10),
      echecs_paiement: 0,
      suspendu_le: null,
    });
    await db.update('factures', facture.id, { abonnement_id: abonnement.id });
  }

  await db.update('devis', devis.id, { statut: 'accepte', accepte_le: maintenant.toISOString() });

  // En mode démo aucun lien Stripe n'est créé : la facture reste « émise ».
  let lienPaiement: string | null = null;
  if (!config.demo) {
    const customerId = await creerOuRecupererClient({
      email: client.email,
      nom: client.raison_sociale,
      stripeCustomerId: client.stripe_customer_id,
    });
    if (customerId !== client.stripe_customer_id) {
      await db.update('clients', client.id, { stripe_customer_id: customerId });
    }

    const paiement = await creerPaiementUnique({
      customerId,
      montantEuros: devis.total_oneshot,
      libelle: `Création de site — ${client.raison_sociale}`,
      reference: facture.numero,
    });
    lienPaiement = paiement.url;

    if (abonnement) {
      const abo = await creerAbonnement({
        customerId,
        montantMensuelEuros: abonnement.prix_mensuel,
        libelle: 'Hébergement & Maintenance',
        moisOfferts: devis.promo_code === 'PREMIERMOIS' ? 1 : 0,
      });
      await db.update('abonnements', abonnement.id, { statut_stripe: 'checkout_ouvert', stripe_subscription_id: abo.sessionId });
    }
  }

  return { facture, abonnement, lienPaiement };
}

/**
 * Échec de prélèvement : relance automatique, puis suspension du site passé
 * le délai configuré dans Paramètres.
 */
export async function traiterEchecPaiement(abonnementId: string): Promise<{
  abonnement: Abonnement;
  siteSuspendu: boolean;
}> {
  const abonnement = await db.get<Abonnement>('abonnements', abonnementId);
  if (!abonnement) throw new Error('Abonnement introuvable.');

  const echecs = abonnement.echecs_paiement + 1;
  const delaiJours = await getParametreNombre('delai_suspension_impaye_jours', 15);

  // Une relance par échec ; au-delà de 2 échecs sur la période, on suspend.
  const suspendre = echecs >= 3;
  const misAJour = await db.update<Abonnement>('abonnements', abonnementId, {
    echecs_paiement: echecs,
    statut: suspendre ? 'suspendu' : 'en_echec',
    statut_stripe: 'past_due',
    suspendu_le: suspendre ? new Date().toISOString() : null,
  });

  if (suspendre && abonnement.site_id) {
    await db.update('sites', abonnement.site_id, { statut: 'hors_ligne' });
  }

  await alerter(
    suspendre
      ? `⛔ Abonnement ${abonnementId} suspendu après ${echecs} échecs de paiement (délai ${delaiJours} j).`
      : `⚠️ Échec de paiement n°${echecs} sur l'abonnement ${abonnementId}, relance envoyée.`,
  );

  return { abonnement: misAJour!, siteSuspendu: suspendre };
}

/** Marque une facture comme payée (webhook Stripe ou saisie manuelle). */
export async function marquerPayee(factureId: string, moyen = 'stripe'): Promise<Facture | null> {
  return db.update<Facture>('factures', factureId, {
    statut_paiement: 'payee',
    moyen_paiement: moyen,
    date_paiement: new Date().toISOString(),
  });
}
