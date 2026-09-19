import { redirect } from 'next/navigation';
import { FormulaireConnexion } from '@/components/formulaire-connexion';
import { config } from '@/lib/config';
import { installationRequise, secretTotp } from '@/lib/auth/identifiants';
import { sessionCourante } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/**
 * Écran de configuration, affiché quand l'application ne peut pas atteindre son
 * stockage.
 *
 * Sans lui, une configuration incomplète produit un écran blanc portant un
 * simple numéro d'erreur : le message utile n'existe que dans les journaux du
 * serveur, auxquels personne ne pense au moment où il en aurait besoin. La page
 * de connexion est le premier endroit où le problème se manifeste, c'est donc
 * là qu'il doit se lire.
 */
function ConfigurationIncomplete({ message }: { message: string }) {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col justify-center">
      <h1 className="text-xl font-semibold">Configuration incomplète</h1>
      <p className="mt-1 text-sm text-ardoise-500">
        L&apos;application a bien démarré, mais elle ne peut pas atteindre son stockage. Elle
        refuse de fonctionner plutôt que de risquer de perdre vos données.
      </p>
      <p className="mt-4 rounded-lg bg-ardoise-100 p-3 text-sm leading-relaxed text-ardoise-700">
        {message}
      </p>
      <p className="mt-4 text-xs text-ardoise-500">
        Après avoir corrigé la configuration de votre hébergeur, un nouveau déploiement est
        nécessaire : les variables ajoutées ne s&apos;appliquent pas aux déploiements existants.
      </p>
    </div>
  );
}

export default async function LoginPage() {
  if (await sessionCourante()) redirect('/');

  let installation: boolean;
  let secret: string | null;

  try {
    [installation, secret] = await Promise.all([installationRequise(), secretTotp()]);
  } catch (err) {
    // `redirect()` s'implémente par une exception : la relancer telle quelle,
    // sinon toute redirection deviendrait une erreur de configuration.
    if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) throw err;
    return <ConfigurationIncomplete message={err instanceof Error ? err.message : String(err)} />;
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center">
      <h1 className="text-xl font-semibold">SiteForge AI</h1>
      <p className="mt-1 mb-6 text-sm text-ardoise-500">
        {installation
          ? 'Première utilisation : choisissez le mot de passe qui protégera votre application.'
          : `Application mono-utilisateur. Connexion par mot de passe${secret ? ' et code 2FA' : ''}.`}
      </p>
      <FormulaireConnexion
        emailParDefaut={config.auth.email}
        demo={config.demo}
        deuxFacteurs={Boolean(secret)}
        installation={installation}
      />
    </div>
  );
}
