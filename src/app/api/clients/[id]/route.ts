import { z } from 'zod';
import { erreur, erreurInterne, ok } from '@/lib/api';
import { db } from '@/lib/db';
import type { Client } from '@/lib/types';

const Corps = z.object({
  raison_sociale: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  contact_nom: z.string().nullable().optional(),
  telephone: z.string().nullable().optional(),
  siret: z.string().nullable().optional(),
  secteur: z.string().nullable().optional(),
  adresse: z.string().nullable().optional(),
  code_postal: z.string().nullable().optional(),
  ville: z.string().nullable().optional(),
});

/**
 * Correction d'une fiche client.
 *
 * Une faute dans l'email casse tout le pipeline de validation : il faut
 * pouvoir la corriger sans repasser par la prospection.
 */
export async function PATCH(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const corps = Corps.safeParse(await requete.json());
    if (!corps.success) return erreur(corps.error.issues[0]?.message ?? 'Valeurs invalides.');

    const patch: Record<string, unknown> = { ...corps.data };

    if (typeof patch.siret === 'string') {
      const siret = patch.siret.replace(/\s/g, '');
      if (siret && !/^\d{14}$/.test(siret)) {
        return erreur('Le SIRET doit comporter 14 chiffres.');
      }
      if (siret) {
        const existant = await db.findOne<Client>('clients', { siret });
        if (existant && existant.id !== id) {
          return erreur(`Ce SIRET est déjà rattaché au client « ${existant.raison_sociale} ».`, 409);
        }
      }
      patch.siret = siret || null;
    }

    if (typeof patch.email === 'string') patch.email = patch.email.toLowerCase();

    const client = await db.update<Client>('clients', id, patch);
    if (!client) return erreur('Client introuvable.', 404);
    return ok({ client });
  } catch (err) {
    return erreurInterne(err);
  }
}

/** Suppression d'une fiche créée par erreur. */
export async function DELETE(_requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Un client qui a des sites, devis ou factures n'est pas supprimable :
    // ce serait perdre des pièces comptables.
    const [sites, devis, factures] = await Promise.all([
      db.list('sites', { client_id: id }),
      db.list('devis', { client_id: id }),
      db.list('factures', { client_id: id }),
    ]);

    if (sites.length + devis.length + factures.length > 0) {
      return erreur(
        'Ce client a des sites, devis ou factures rattachés : il ne peut pas être supprimé.',
        409,
      );
    }

    return ok({ supprime: await db.remove('clients', id) });
  } catch (err) {
    return erreurInterne(err);
  }
}
