import { z } from 'zod';
import { erreur, erreurInterne, ok } from '@/lib/api';
import { db } from '@/lib/db';
import { notifier } from '@/lib/notifications';
import type { Client, Prospect } from '@/lib/types';

/**
 * Réception des emails entrants (réponses de prospects et de clients).
 *
 * À brancher comme webhook chez Resend (`email.received`) ou Brevo (`inbound`).
 * Les deux fournisseurs envoient des enveloppes de formes différentes : on ne
 * retient que les trois champs qui nous intéressent, quel que soit le format.
 */
const Corps = z
  .object({
    from: z.string().optional(),
    sender: z.string().optional(),
    subject: z.string().optional(),
    text: z.string().optional(),
    html: z.string().optional(),
    // Resend imbrique la charge utile sous `data`.
    data: z
      .object({
        from: z.string().optional(),
        subject: z.string().optional(),
        text: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

function extraireAdresse(brut: string): string {
  return brut.match(/<([^>]+)>/)?.[1]?.toLowerCase() ?? brut.trim().toLowerCase();
}

export async function POST(requete: Request) {
  try {
    const corps = Corps.safeParse(await requete.json());
    if (!corps.success) return erreur('Charge utile illisible.');

    const donnees = corps.data;
    const expediteurBrut = donnees.data?.from ?? donnees.from ?? donnees.sender;
    if (!expediteurBrut) return erreur('Expéditeur absent.');

    const expediteur = extraireAdresse(expediteurBrut);
    const sujet = donnees.data?.subject ?? donnees.subject ?? '(sans objet)';
    const texte = (donnees.data?.text ?? donnees.text ?? '').slice(0, 400);

    // On rattache le message à la fiche correspondante quand on la retrouve.
    const client = await db.findOne<Client>('clients', { email: expediteur });
    const prospect = client ? null : await db.findOne<Prospect>('prospects', { email: expediteur });

    await db.insert('notes', {
      client_id: client?.id ?? null,
      prospect_id: prospect?.id ?? null,
      auteur: 'email_entrant',
      contenu: `Réponse de ${expediteur} — ${sujet}\n\n${texte}`,
      created_at: new Date().toISOString(),
    });

    await notifier({
      type: 'email_recu',
      titre: `Réponse de ${client?.raison_sociale ?? prospect?.raison_sociale ?? expediteur}`,
      message: `${sujet}${texte ? ` — ${texte.slice(0, 140)}` : ''}`,
      lien: client ? `/clients/${client.id}` : '/prospection',
      clientId: client?.id ?? null,
      urgent: true,
    });

    return ok({ recu: true }, 201);
  } catch (err) {
    return erreurInterne(err);
  }
}
