import { Carte, TitrePage, TitreSection } from '@/components/ui';
import { GrilleTarifaire } from '@/components/grille-tarifaire';
import { config } from '@/lib/config';
import { getOffresPromo, getParametres, getPricingRules } from '@/lib/repositories';

export const dynamic = 'force-dynamic';

export default async function ParametresPage() {
  const [regles, promos, parametres] = await Promise.all([
    getPricingRules(false),
    getOffresPromo(),
    getParametres(),
  ]);

  return (
    <>
      <TitrePage
        titre="Paramètres"
        sousTitre="Grille tarifaire, offres de lancement et seuils de marge — modifiables sans toucher au code."
      />

      <GrilleTarifaire reglesInitiales={regles} promosInitiales={promos} parametresInitiaux={parametres} />

      <Carte className="mt-4">
        <TitreSection>Intégrations</TitreSection>
        <ul className="space-y-1.5 text-sm">
          {[
            ['Mode démo', config.demo ? 'activé (données fictives)' : 'désactivé'],
            ['Base de données', config.database.url ? 'PostgreSQL configuré' : 'non configurée'],
            ['Génération IA', config.anthropic.apiKey ? `API Claude — ${config.anthropic.model}` : 'clé absente'],
            ['Recherche', config.perplexity.apiKey ? 'Perplexity configuré' : 'clé absente'],
            ['Hébergement', config.vercel.token ? 'Vercel configuré' : 'jeton absent'],
            ['DNS / SSL', config.cloudflare.token ? 'Cloudflare configuré' : 'jeton absent'],
            ['Paiement', config.stripe.secretKey ? 'Stripe configuré' : 'clé absente'],
            ['Emailing', config.email.resendKey || config.email.brevoKey ? config.email.provider : 'non configuré'],
          ].map(([libelle, valeur]) => (
            <li key={libelle} className="flex justify-between gap-3 border-b border-ardoise-100 pb-1.5">
              <span className="text-ardoise-500">{libelle}</span>
              <span>{valeur}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ardoise-500">
          Les clés se renseignent dans <code>.env.local</code> (voir <code>.env.example</code>). Tant que
          DEMO_MODE reste à <code>true</code>, aucune API externe n&apos;est appelée.
        </p>
      </Carte>

      <Carte className="mt-4">
        <TitreSection>Conformité RGPD — prospection B2B</TitreSection>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ardoise-700">
          <li>Régime opt-out B2B : uniquement des adresses professionnelles.</li>
          <li>Objet du message en lien direct avec l&apos;activité du destinataire.</li>
          <li>Identité de l&apos;expéditeur affichée dans chaque email (nom, SIREN, adresse).</li>
          <li>Lien de désinscription effectif, prise en compte sous 24 h.</li>
          <li>
            Table <code>unsubscribed_emails</code> consultée avant tout envoi — aucun contournement possible.
          </li>
          <li>
            Conservation limitée à {parametres.retention_prospect_mois ?? '36'} mois après le dernier contact actif.
          </li>
        </ul>
      </Carte>
    </>
  );
}
