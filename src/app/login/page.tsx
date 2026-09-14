import { redirect } from 'next/navigation';
import { FormulaireConnexion } from '@/components/formulaire-connexion';
import { config } from '@/lib/config';
import { sessionCourante } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await sessionCourante()) redirect('/');

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center">
      <h1 className="text-xl font-semibold">SiteForge AI</h1>
      <p className="mt-1 mb-6 text-sm text-ardoise-500">
        Application mono-utilisateur. Connexion par mot de passe
        {config.auth.totpSecret ? ' et code 2FA' : ''}.
      </p>
      <FormulaireConnexion
        emailParDefaut={config.auth.email}
        demo={config.demo && !config.auth.passwordHash}
        deuxFacteurs={Boolean(config.auth.totpSecret)}
      />
    </div>
  );
}
