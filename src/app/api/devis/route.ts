import { z } from 'zod';
import { erreur, erreurInterne, ok } from '@/lib/api';
import { config, euros } from '@/lib/config';
import { envoyerEmail, gabaritDevis } from '@/lib/integrations/email';
import { creerDevis, simuler } from '@/lib/pipeline/facturation';
import { db } from '@/lib/db';
import type { Client } from '@/lib/types';

const Options = z.array(z.object({ code: z.string(), quantite: z.number().int().min(1).optional() }));

const CorpsDevis = z.object({
  clientId: z.string().min(1),
  siteId: z.string().nullable().optional(),
  options: Options.min(1),
  promoCode: z.string().nullable().optional(),
  coutAcquisitionAds: z.number().min(0).optional(),
  statut: z.enum(['brouillon', 'envoye']).optional(),
});

const CorpsSimulation = z.object({
  options: Options,
  promoCode: z.string().nullable().optional(),
  coutAcquisitionAds: z.number().min(0).optional(),
});

/** Simulation de prix et de marge, sans rien enregistrer. */
export async function PUT(requete: Request) {
  try {
    const corps = CorpsSimulation.safeParse(await requete.json());
    if (!corps.success) return erreur('Sélection invalide.');
    return ok(await simuler(corps.data));
  } catch (err) {
    return erreurInterne(err);
  }
}

export async function POST(requete: Request) {
  try {
    const corps = CorpsDevis.safeParse(await requete.json());
    if (!corps.success) return erreur('Sélection invalide.');

    const { devis, simulation } = await creerDevis(corps.data);

    if (devis.statut === 'envoye') {
      const client = await db.get<Client>('clients', devis.client_id);
      if (client) {
        const gabarit = gabaritDevis({
          raisonSociale: client.raison_sociale,
          numero: devis.numero,
          total: euros(devis.total_oneshot),
          mensuel: devis.total_mensuel > 0 ? euros(devis.total_mensuel) : null,
        });
        await envoyerEmail({
          destinataire: client.email,
          sujet: gabarit.sujet,
          html: `${gabarit.html}<p><a href="${config.appBaseUrl}/api/devis/${devis.id}/pdf">Télécharger le devis (PDF)</a></p>`,
          gabarit: 'devis',
          clientId: client.id,
        });
      }
    }

    return ok({ devis, marge: simulation.marge }, 201);
  } catch (err) {
    return erreurInterne(err);
  }
}
