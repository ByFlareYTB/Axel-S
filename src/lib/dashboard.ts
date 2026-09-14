// ---------------------------------------------------------------------------
// Agrégats du Dashboard : prospection, revenus, marge nette moyenne par site,
// MRR des abonnements, Ads et sites en attente de validation.
// ---------------------------------------------------------------------------

import { db } from '@/lib/db';
import { kpiCampagne } from '@/lib/integrations/ads';
import type {
  Abonnement,
  CampagneAds,
  Client,
  Devis,
  Facture,
  HostingInstance,
  Prospect,
  Site,
  ValidationClient,
} from '@/lib/types';

export interface KpiDashboard {
  prospection: {
    demarches: number;
    enAttente: number;
    convertis: number;
    refuses: number;
    tauxConversion: number;
  };
  revenus: {
    jour: number;
    semaine: number;
    mois: number;
    total: number;
    impayes: number;
  };
  sites: {
    total: number;
    actifs: number;
    enTest: number;
    enAttenteValidation: number;
  };
  clients: number;
  /** Revenu encaissé − coût IA − coût d'hébergement, moyenné par site. */
  margeNetteMoyenne: number;
  /** Revenu récurrent mensuel issu des abonnements actifs. */
  mrr: number;
  ads: {
    depense: number;
    revenus: number;
    leads: number;
    coutParLead: number | null;
    roas: number | null;
  };
  devisEnAttente: number;
  alertesMarge: number;
}

export interface PointSerie {
  label: string;
  valeur: number;
}

function debutDeJour(decalageJours = 0): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime() - decalageJours * 86_400_000;
}

function montantPaye(facture: Facture): number {
  return facture.statut_paiement === 'payee' ? facture.total_ttc : 0;
}

function dateFacture(facture: Facture): number {
  return new Date(facture.date_paiement ?? facture.date).getTime();
}

export async function calculerKpi(): Promise<KpiDashboard> {
  const [prospects, clients, sites, factures, abonnements, campagnes, hebergements, devis, validations] =
    await Promise.all([
      db.list<Prospect>('prospects'),
      db.list<Client>('clients'),
      db.list<Site>('sites'),
      db.list<Facture>('factures'),
      db.list<Abonnement>('abonnements'),
      db.list<CampagneAds>('campagnes_ads'),
      db.list<HostingInstance>('hosting_instances'),
      db.list<Devis>('devis'),
      db.list<ValidationClient>('validations_client'),
    ]);

  const demarches = prospects.length;
  const convertis = prospects.filter((p) => p.statut === 'client').length;
  const enAttente = prospects.filter((p) => p.statut === 'en_attente').length;
  const refuses = prospects.filter((p) => p.statut === 'refuse').length;

  const revenus = {
    jour: 0,
    semaine: 0,
    mois: 0,
    total: 0,
    impayes: 0,
  };
  for (const facture of factures) {
    if (facture.statut_paiement === 'impayee' || facture.statut_paiement === 'emise') {
      revenus.impayes += facture.total_ttc;
      continue;
    }
    const montant = montantPaye(facture);
    if (montant === 0) continue;
    revenus.total += montant;
    const t = dateFacture(facture);
    if (t >= debutDeJour(0)) revenus.jour += montant;
    if (t >= debutDeJour(7)) revenus.semaine += montant;
    if (t >= debutDeJour(30)) revenus.mois += montant;
  }

  // Marge nette par site : ce qui a été encaissé pour ce client, moins les
  // coûts réellement engagés (génération IA + hébergement mensuel).
  const marges = sites.map((site) => {
    const encaisse = factures
      .filter((f) => f.client_id === site.client_id)
      .reduce((s, f) => s + montantPaye(f), 0);
    const hebergement = hebergements.find((h) => h.site_id === site.id);
    return encaisse - site.cout_generation_ia - (hebergement?.cout_mensuel_reel ?? 0);
  });
  const margeNetteMoyenne = marges.length
    ? Number((marges.reduce((a, b) => a + b, 0) / marges.length).toFixed(2))
    : 0;

  const mrr = Number(
    abonnements
      .filter((a) => a.statut === 'actif')
      .reduce((s, a) => s + a.prix_mensuel, 0)
      .toFixed(2),
  );

  const depenseAds = campagnes.reduce((s, c) => s + c.depense, 0);
  const revenusAds = campagnes.reduce((s, c) => s + c.revenus_attribues, 0);
  const leadsAds = campagnes.reduce((s, c) => s + c.leads, 0);
  const totalAds = kpiCampagne({
    ...campagnes[0],
    depense: depenseAds,
    leads: leadsAds,
    conversions: campagnes.reduce((s, c) => s + c.conversions, 0),
    revenus_attribues: revenusAds,
  } as CampagneAds);

  const enAttenteValidation = validations.filter(
    (v) => v.statut === 'envoyee' || v.statut === 'modifications_demandees',
  ).length;

  return {
    prospection: {
      demarches,
      enAttente,
      convertis,
      refuses,
      tauxConversion: demarches > 0 ? Number(((convertis / demarches) * 100).toFixed(1)) : 0,
    },
    revenus: {
      jour: Number(revenus.jour.toFixed(2)),
      semaine: Number(revenus.semaine.toFixed(2)),
      mois: Number(revenus.mois.toFixed(2)),
      total: Number(revenus.total.toFixed(2)),
      impayes: Number(revenus.impayes.toFixed(2)),
    },
    sites: {
      total: sites.length,
      actifs: sites.filter((s) => s.statut === 'production' || s.statut === 'maintenance').length,
      enTest: sites.filter((s) => s.statut === 'test').length,
      enAttenteValidation,
    },
    clients: clients.length,
    margeNetteMoyenne,
    mrr,
    ads: {
      depense: Number(depenseAds.toFixed(2)),
      revenus: Number(revenusAds.toFixed(2)),
      leads: leadsAds,
      coutParLead: totalAds.coutParLead,
      roas: totalAds.roas,
    },
    devisEnAttente: devis.filter((d) => d.statut === 'envoye').length,
    alertesMarge: devis.filter((d) => d.alerte_marge).length,
  };
}

/** Revenus encaissés des 6 derniers mois, pour le graphique du Dashboard. */
export async function revenusMensuels(nbMois = 6): Promise<PointSerie[]> {
  const factures = await db.list<Facture>('factures');
  const points: PointSerie[] = [];
  const formateur = new Intl.DateTimeFormat('fr-FR', { month: 'short' });

  for (let i = nbMois - 1; i >= 0; i--) {
    const reference = new Date();
    reference.setDate(1);
    reference.setMonth(reference.getMonth() - i);
    const debut = reference.getTime();
    const fin = new Date(reference.getFullYear(), reference.getMonth() + 1, 1).getTime();

    const valeur = factures
      .filter((f) => {
        const t = dateFacture(f);
        return t >= debut && t < fin;
      })
      .reduce((s, f) => s + montantPaye(f), 0);

    points.push({ label: formateur.format(reference), valeur: Number(valeur.toFixed(2)) });
  }
  return points;
}
