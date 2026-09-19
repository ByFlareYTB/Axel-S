// ---------------------------------------------------------------------------
// Meta Ads et Google Ads en lecture seule : l'app consulte les performances,
// elle ne pilote jamais les campagnes.
// ---------------------------------------------------------------------------

import { config } from '@/lib/config';
import { db } from '@/lib/db';
import type { CampagneAds } from '@/lib/types';
import { requeteJson } from './http';

interface InsightMeta {
  campaign_id: string;
  campaign_name: string;
  spend: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
}

function valeurAction(liste: { action_type: string; value: string }[] | undefined, type: string): number {
  return Number(liste?.find((a) => a.action_type === type)?.value ?? 0);
}

/** Récupère les performances Meta Ads et les enregistre en base. */
export async function synchroniserMeta(): Promise<CampagneAds[]> {
  const champs = 'campaign_id,campaign_name,spend,actions,action_values';
  const url =
    `https://graph.facebook.com/v21.0/act_${config.ads.metaAccountId}/insights` +
    `?level=campaign&fields=${champs}&date_preset=last_30d&access_token=${config.ads.metaToken}`;

  const reponse = await requeteJson<{ data: InsightMeta[] }>('Meta Ads', url);

  const campagnes: CampagneAds[] = [];
  for (const insight of reponse.data) {
    const existante = await db.findOne<CampagneAds>('campagnes_ads', {
      plateforme: 'meta',
      nom: insight.campaign_name,
    });
    const donnees = {
      plateforme: 'meta',
      nom: insight.campaign_name,
      statut: 'active',
      depense: Number(insight.spend ?? 0),
      leads: valeurAction(insight.actions, 'lead'),
      conversions: valeurAction(insight.actions, 'purchase'),
      revenus_attribues: valeurAction(insight.action_values, 'purchase'),
    };
    campagnes.push(
      existante
        ? (await db.update<CampagneAds>('campagnes_ads', existante.id, donnees))!
        : await db.insert<CampagneAds>('campagnes_ads', { ...donnees, budget: 0 }),
    );
  }
  return campagnes;
}

/** Coût/lead et ROAS, dérivés à l'affichage plutôt que stockés. */
export function kpiCampagne(campagne: CampagneAds): {
  coutParLead: number | null;
  coutParConversion: number | null;
  roas: number | null;
} {
  return {
    coutParLead: campagne.leads > 0 ? Number((campagne.depense / campagne.leads).toFixed(2)) : null,
    coutParConversion:
      campagne.conversions > 0 ? Number((campagne.depense / campagne.conversions).toFixed(2)) : null,
    roas: campagne.depense > 0 ? Number((campagne.revenus_attribues / campagne.depense).toFixed(2)) : null,
  };
}

/**
 * Coût d'acquisition moyen imputé à un nouveau client, injecté dans le
 * calculateur de marge du module Facturation.
 */
export async function coutAcquisitionMoyen(): Promise<number> {
  const campagnes = await db.list<CampagneAds>('campagnes_ads');
  const depense = campagnes.reduce((s, c) => s + c.depense, 0);
  const conversions = campagnes.reduce((s, c) => s + c.conversions, 0);
  return conversions > 0 ? Number((depense / conversions).toFixed(2)) : 0;
}
