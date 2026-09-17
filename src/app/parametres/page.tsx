import { Badge, Carte, TitrePage, TitreSection } from '@/components/ui';
import { GrilleTarifaire } from '@/components/grille-tarifaire';
import { config } from '@/lib/config';
import { stockageActif } from '@/lib/db';
import { cheminFichierDonnees } from '@/lib/db/file-source';
import { diagnosticDelivrabilite } from '@/lib/integrations/delivrabilite';
import { enregistrementsRequis, modeDns } from '@/lib/integrations/dns';
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

  const delivrabilite = diagnosticDelivrabilite();
  const aCorriger = delivrabilite.filter((point) => !point.conforme);

  const mode = modeDns();
  const dns = enregistrementsRequis();

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


      <Carte className="mt-4">
        <TitreSection
          action={
            <Badge ton={aCorriger.length === 0 ? 'succes' : 'alerte'}>
              {delivrabilite.length - aCorriger.length}/{delivrabilite.length} conformes
            </Badge>
          }
        >
          Délivrabilité des emails
        </TitreSection>

        <p className="mb-3 text-sm text-ardoise-500">
          Un envoi accepté par le fournisseur n&apos;est pas un envoi lu. Ces trois points
          décident du classement en indésirables.
        </p>

        <ul className="space-y-2.5">
          {delivrabilite.map((point) => (
            <li key={point.code} className="border-b border-ardoise-100 pb-2.5 last:border-0 last:pb-0">
              <span className="text-sm font-medium">
                {point.conforme ? '✅' : '⚠️'} {point.libelle}
              </span>
              {!point.conforme && (
                <>
                  <p className="mt-1 text-xs text-ardoise-600">{point.consequence}</p>
                  <p className="mt-1 text-xs text-ardoise-500">
                    <strong>À faire :</strong> {point.correction}
                  </p>
                </>
              )}
            </li>
          ))}
        </ul>
      </Carte>

      <Carte className="mt-4">
        <TitreSection
          action={
            <Badge ton={mode === 'aucun' ? 'alerte' : 'succes'}>
              {mode === 'cloudflare' ? 'API Cloudflare' : mode === 'wildcard' ? 'Générique' : 'Non configuré'}
            </Badge>
          }
        >
          Sous-domaines des sites clients
        </TitreSection>

        {mode === 'cloudflare' && (
          <p className="text-sm text-ardoise-500">
            Chaque sous-domaine client est créé à la demande via l&apos;API Cloudflare.
          </p>
        )}

        {mode === 'wildcard' && (
          <p className="text-sm text-ardoise-500">
            Un enregistrement générique publie d&apos;avance tout sous-domaine de{' '}
            <code>{config.domaine.racine}</code>. Aucune API DNS n&apos;est nécessaire.
          </p>
        )}

        {mode === 'aucun' && (
          <>
            <p className="text-sm text-ardoise-600">
              Les sites mis en production resteront joignables sur leur URL d&apos;hébergement, pas
              sur un sous-domaine de <code>{config.domaine.racine}</code>. Créez les
              enregistrements ci-dessous chez votre registrar, une fois pour toutes, puis posez{' '}
              <code>DNS_WILDCARD=true</code>.
            </p>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-ardoise-500">
                  <tr>
                    <th className="pb-1.5 pr-3 font-medium">Type</th>
                    <th className="pb-1.5 pr-3 font-medium">Nom</th>
                    <th className="pb-1.5 pr-3 font-medium">Valeur</th>
                    <th className="pb-1.5 font-medium">Rôle</th>
                  </tr>
                </thead>
                <tbody>
                  {dns.map((e) => (
                    <tr key={e.nom} className="border-t border-ardoise-100 align-top">
                      <td className="py-1.5 pr-3 font-mono">{e.type}</td>
                      <td className="py-1.5 pr-3 font-mono">{e.nom}</td>
                      <td className="py-1.5 pr-3 font-mono">
                        {e.valeur ?? <span className="font-sans text-ardoise-500">{e.ou}</span>}
                      </td>
                      <td className="py-1.5 text-ardoise-500">{e.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
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
