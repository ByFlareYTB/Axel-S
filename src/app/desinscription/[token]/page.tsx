import { db } from '@/lib/db';
import { desinscrire } from '@/lib/integrations/email';
import type { EmailEnvoye } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Désinscription en un clic depuis le pied de page des emails de prospection.
 * L'adresse est immédiatement ajoutée à unsubscribed_emails, qui est consultée
 * avant tout envoi ultérieur (obligation de prise en compte sous 24 h).
 */
export default async function DesinscriptionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const email = await db.findOne<EmailEnvoye>('emails_envoyes', { token_desinscription: token });

  if (!email) {
    return (
      <div className="mx-auto max-w-lg py-12">
        <h1 className="text-xl font-semibold">Lien de désinscription inconnu</h1>
        <p className="mt-2 text-sm text-ardoise-500">
          Ce lien n&apos;est plus valide. Écrivez-nous et nous procéderons manuellement au retrait.
        </p>
      </div>
    );
  }

  await desinscrire(email.destinataire);

  return (
    <div className="mx-auto max-w-lg py-12">
      <h1 className="text-xl font-semibold">Vous êtes désinscrit</h1>
      <p className="mt-2 text-sm text-ardoise-500">
        L&apos;adresse <strong>{email.destinataire}</strong> ne recevra plus aucun message de notre part.
        La prise en compte est immédiate.
      </p>
    </div>
  );
}
