import { db } from '@/lib/db';
import { enregistrerValidation } from '@/lib/pipeline/site';
import type { ValidationClient } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Page publique ouverte par le client depuis l'email de validation.
 * Les deux boutons de l'email pointent ici avec ?reponse=approuve|modifications.
 */
export default async function ValidationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ reponse?: string; commentaire?: string }>;
}) {
  const { token } = await params;
  const { reponse, commentaire } = await searchParams;

  const validation = await db.findOne<ValidationClient>('validations_client', { token });
  if (!validation) {
    return <Message titre="Lien inconnu" texte="Ce lien de validation n'existe pas ou a été révoqué." />;
  }

  if (reponse !== 'approuve' && reponse !== 'modifications') {
    return (
      <div className="mx-auto max-w-lg py-12">
        <h1 className="text-xl font-semibold">Validation de votre site</h1>
        <p className="mt-2 text-sm text-ardoise-500">
          Version {validation.version} — merci de nous indiquer votre décision.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={`?reponse=approuve`}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
          >
            J&apos;approuve, mettez en ligne
          </a>
          <a
            href={`?reponse=modifications`}
            className="rounded-lg border border-ardoise-300 px-4 py-2 text-sm font-medium"
          >
            Je souhaite des modifications
          </a>
        </div>
      </div>
    );
  }

  try {
    const resultat = await enregistrerValidation(token, reponse, commentaire);
    return reponse === 'approuve' ? (
      <Message
        titre="Merci, votre site part en ligne"
        texte={
          resultat.production
            ? `Votre site est désormais accessible à l'adresse ${resultat.production.urlProduction}. Votre devis et votre facture vous ont été envoyés.`
            : 'Votre approbation a bien été enregistrée.'
        }
      />
    ) : (
      <Message
        titre="Demande de modifications enregistrée"
        texte="Nous revenons vers vous très vite avec une nouvelle version."
      />
    );
  } catch (err) {
    return (
      <Message titre="Impossible de traiter ce lien" texte={err instanceof Error ? err.message : 'Erreur inconnue.'} />
    );
  }
}

function Message({ titre, texte }: { titre: string; texte: string }) {
  return (
    <div className="mx-auto max-w-lg py-12">
      <h1 className="text-xl font-semibold">{titre}</h1>
      <p className="mt-2 text-sm text-ardoise-500">{texte}</p>
    </div>
  );
}
