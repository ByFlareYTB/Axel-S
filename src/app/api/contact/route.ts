import { z } from 'zod';
import { erreur, erreurInterne, ok } from '@/lib/api';
import { db } from '@/lib/db';
import { notifier } from '@/lib/notifications';

const Corps = z.object({
  site: z.string().optional(),
  nom: z.string().min(1),
  email: z.string().email(),
  message: z.string().min(1),
});

/**
 * Point d'entrée des formulaires de contact des sites générés.
 * Le message est journalisé comme note, rattaché au client quand le site est
 * identifié.
 */
export async function POST(requete: Request) {
  try {
    const corps = Corps.safeParse(await requete.json());
    if (!corps.success) return erreur('Formulaire incomplet.');

    const site = corps.data.site
      ? await db.findOne<{ client_id: string }>('sites', { id: corps.data.site })
      : null;

    await db.insert('notes', {
      client_id: site?.client_id ?? null,
      prospect_id: null,
      auteur: 'formulaire_site',
      contenu: `Message de ${corps.data.nom} <${corps.data.email}> : ${corps.data.message}`,
      created_at: new Date().toISOString(),
    });

    // Un prospect qui écrit depuis un site livré est un signal commercial :
    // il remonte immédiatement dans la cloche.
    await notifier({
      type: 'email_recu',
      titre: `Message reçu de ${corps.data.nom}`,
      message: `${corps.data.email} — ${corps.data.message.slice(0, 140)}`,
      lien: site ? `/clients/${site.client_id}` : '/clients',
      clientId: site?.client_id ?? null,
      siteId: corps.data.site ?? null,
      urgent: true,
    });

    return ok({ ok: true }, 201);
  } catch (err) {
    return erreurInterne(err);
  }
}
