import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { desinscrire } from '@/lib/integrations/email';
import type { EmailEnvoye } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Désinscription en un clic (RFC 8058).
 *
 * C'est le bouton « Se désabonner » que Gmail et Outlook affichent eux-mêmes
 * en haut du message. Ils appellent cette route en POST, sans ouvrir de page :
 * la désinscription doit donc être effective immédiatement, sans confirmation.
 *
 * L'en-tête List-Unsubscribe-Post promet ce comportement. Un expéditeur qui
 * l'annonce sans le tenir est pénalisé ; la page /desinscription/[token] reste
 * disponible pour le lien humain du pied de page.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const email = await db.findOne<EmailEnvoye>('emails_envoyes', { token_desinscription: token });

  // Un jeton inconnu renvoie tout de même 200 : le client de messagerie
  // n'affiche pas d'erreur utile, et un échec ferait croire à un bouton cassé.
  if (!email) return new NextResponse(null, { status: 200 });

  await desinscrire(email.destinataire, 'Bouton de désabonnement du client de messagerie');
  return new NextResponse(null, { status: 200 });
}
