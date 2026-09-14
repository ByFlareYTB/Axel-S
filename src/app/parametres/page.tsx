import { Badge, Carte, TitrePage, TitreSection } from '@/components/ui';
import { GrilleTarifaire } from '@/components/grille-tarifaire';
import { config } from '@/lib/config';
import { stockageActif } from '@/lib/db';
import { cheminFichierDonnees } from '@/lib/db/file-source';
import { etatCapacites } from '@/lib/integrations/prerequis';
import { getOffresPromo, getParametres, getPricingRules } from '@/lib/repositories';

export const dynamic = 'force-dynamic';

export default async function ParametresPage() {
  const [regles, promos, parametres] = await Promise.all([
    getPricingRules(false),
    getOffresPromo(),
    getParametres(),
  ]);

  const capacites = etatCapacites();
  const indisponibles = capacites.filter((c) => !c.disponible);

  return (
    <>
      <TitrePage
        titre="Paramètres"
        sousTitre="Grille tarifaire, offres de lancement, seuils de marge et état des intégrations."
      />

      <Carte className="mb-4">
        <TitreSection
          action={
            <Badge ton={indisponibles.length === 0 ? 'succes' : 'alerte'}>
              {capacites.length - indisponibles.length}/{capacites.length} actives
            </Badge>
          }
        >
          Intégrations
        </TitreSection>

        <ul className="space-y-2.5">
          {capacites.map((capacite) => (
            <li
              key={capacite.capacite}
              className="border-b border-ardoise-100 pb-2.5 last:border-0 last:pb-0"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm font-medium">
                  {capacite.disponible ? '✅' : '⚪'} {capacite.libelle}
                </span>
                <span className="shrink-0 text-xs text-ardoise-500">
                  {capacite.disponible ? 'configurée' : capacite.manquantes.join(', ')}
                </span>
              </div>
              {!capacite.disponible && (
                <p className="mt-1 text-xs text-ardoise-500">
                  {capacite.consequence} <span className="text-ardoise-400">({capacite.ou})</span>
                </p>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-lg bg-ardoise-100 p-3 text-xs text-ardoise-700">
          <p>
            <strong>Stockage :</strong> {stockageActif()}
          </p>
          {!config.demo && !config.database.url && (
            <p className="mt-1 text-ardoise-500">
              Fichier : <code>{cheminFichierDonnees()}</code> — sauvegardez-le comme vous
              sauvegarderiez une comptabilité. Renseignez <code>DATABASE_URL</code> pour passer sur
              PostgreSQL.
            </p>
          )}
          <p className="mt-1 text-ardoise-500">
            Les clés se renseignent dans <code>.env.local</code> (voir <code>.env.example</code>).
            Redémarrez l&apos;application après modification.
          </p>
        </div>
      </Carte>

      <GrilleTarifaire
        reglesInitiales={regles}
        promosInitiales={promos}
        parametresInitiaux={parametres}
      />

      <Carte className="mt-4">
        <TitreSection>Conformité RGPD — prospection B2B</TitreSection>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ardoise-700">
          <li>Régime opt-out B2B : uniquement des adresses professionnelles.</li>
          <li>Objet du message en lien direct avec l&apos;activité du destinataire.</li>
          <li>Identité de l&apos;expéditeur affichée dans chaque email (nom, SIREN, adresse).</li>
          <li>Lien de désinscription effectif, prise en compte sous 24 h.</li>
          <li>
            Table <code>unsubscribed_emails</code> consultée avant tout envoi — aucun contournement
            possible.
          </li>
          <li>
            Conservation limitée à {parametres.retention_prospect_mois ?? '36'} mois après le
            dernier contact actif.
          </li>
        </ul>
      </Carte>
    </>
  );
}
