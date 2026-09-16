import { z } from 'zod';
import { erreur, erreurInterne, ok } from '@/lib/api';
import { db } from '@/lib/db';
import { notifier } from '@/lib/notifications';
import type { Client } from '@/lib/types';

/**
 * Saisie manuelle d'un client.
 *
 * Tous les clients ne viennent pas de la prospection : un appel téléphonique,
 * une recommandation ou un formulaire de contact amènent des clients qu'aucune
 * recherche SIRENE ne fera remonter. Ce chemin doit donc exister.
 */
const Corps = z.object({
  // `trim` avant validation : un email collé depuis un mail ou un tableur
  // traîne souvent une espace, qui ne doit pas faire échouer la saisie.
  raison_sociale: z.string().trim().min(1, 'La raison sociale est obligatoire.'),
  email: z.string().trim().email('Email invalide.'),
  contact_nom: z.string().optional(),
  telephone: z.string().optional(),
  // 14 chiffres, espaces tolérés à la saisie.
  siret: z.string().optional(),
  secteur: z.string().optional(),
  adresse: z.string().optional(),
  code_postal: z.string().optional(),
  ville: z.string().optional(),
});

function nettoyer(valeur: string | undefined): string | null {
  const propre = valeur?.trim();
  return propre ? propre : null;
}

export async function GET() {
  try {
    return ok({
      clients: await db.list<Client>('clients', {}, { orderBy: 'created_at', dir: 'desc' }),
    });
  } catch (err) {
    return erreurInterne(err);
  }
}

export async function POST(requete: Request) {
  try {
    const corps = Corps.safeParse(await requete.json());
    if (!corps.success) {
      return erreur(corps.error.issues[0]?.message ?? 'Fiche incomplète.');
    }

    const siret = nettoyer(corps.data.siret)?.replace(/\s/g, '') ?? null;
    if (siret && !/^\d{14}$/.test(siret)) {
      return erreur('Le SIRET doit comporter 14 chiffres.');
    }

    // Le SIRET est la clé de déduplication de tout le pipeline : deux fiches
    // pour la même entreprise fausseraient le CRM et la facturation.
    if (siret) {
      const existant = await db.findOne<Client>('clients', { siret });
      if (existant) {
        return erreur(`Ce SIRET est déjà rattaché au client « ${existant.raison_sociale} ».`, 409);
      }
    }

    const client = await db.insert<Client>('clients', {
      prospect_id: null,
      raison_sociale: corps.data.raison_sociale,
      contact_nom: nettoyer(corps.data.contact_nom),
      email: corps.data.email.toLowerCase(),
      telephone: nettoyer(corps.data.telephone),
      siret,
      secteur: nettoyer(corps.data.secteur),
      adresse: nettoyer(corps.data.adresse),
      code_postal: nettoyer(corps.data.code_postal),
      ville: nettoyer(corps.data.ville),
      stripe_customer_id: null,
    });

    await notifier({
      type: 'client_confirme',
      titre: `Nouveau client : ${client.raison_sociale}`,
      message: `Fiche créée manuellement${client.ville ? ` (${client.ville})` : ''}. Vous pouvez lancer la génération du site.`,
      lien: `/clients/${client.id}`,
      clientId: client.id,
    });

    return ok({ client }, 201);
  } catch (err) {
    return erreurInterne(err);
  }
}
