import Link from 'next/link';
import { Carte, TitreSection } from '@/components/ui';
import type { EtatCapacite } from '@/lib/integrations/prerequis';

/**
 * Affiché tant qu'aucune activité n'est enregistrée.
 *
 * Un tableau de bord vide n'apprend rien : à la place, on montre la première
 * action à faire et ce qu'il reste à configurer pour que le pipeline aille
 * jusqu'au bout.
 */
export function PremiersPas({
  capacites,
  aDesProspects,
  aDesClients,
}: {
  capacites: EtatCapacite[];
  aDesProspects: boolean;
  aDesClients: boolean;
}) {
  const manquantes = capacites.filter((c) => !c.disponible);

  const etapes = [
    {
      fait: manquantes.length === 0,
      titre: 'Renseigner les clés d’API',
      detail:
        manquantes.length === 0
          ? 'Toutes les intégrations sont configurées.'
          : `${manquantes.length} intégration(s) à configurer : ${manquantes
              .map((c) => c.libelle.toLowerCase())
              .join(', ')}.`,
      lien: '/parametres',
      libelleLien: 'Voir les Paramètres',
    },
    {
      fait: aDesProspects,
      titre: 'Trouver vos premiers prospects',
      detail:
        'Choisissez un secteur et un code postal : l’annuaire SIRENE fournit les entreprises, Perplexity leur présence en ligne.',
      lien: '/prospection',
      libelleLien: 'Lancer une recherche',
    },
    {
      fait: aDesClients,
      titre: 'Convertir un prospect en client',
      detail:
        'Passez un prospect au statut ✅ : sa fiche CRM est créée et vous pouvez générer son site en un clic.',
      lien: '/prospection',
      libelleLien: 'Voir les prospects',
    },
  ];

  return (
    <Carte className="border-sky-200 bg-sky-50/40">
      <TitreSection>Premiers pas</TitreSection>
      <p className="mb-4 text-sm text-ardoise-600">
        Aucune activité enregistrée pour l’instant. Les indicateurs ci-dessous se rempliront avec
        vos données réelles.
      </p>

      <ol className="space-y-3">
        {etapes.map((etape, index) => (
          <li key={etape.titre} className="flex gap-3">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                etape.fait ? 'bg-emerald-600 text-white' : 'bg-ardoise-200 text-ardoise-700'
              }`}
              aria-hidden
            >
              {etape.fait ? '✓' : index + 1}
            </span>
            <div className="min-w-0">
              <p className={`text-sm font-medium ${etape.fait ? 'text-ardoise-500' : ''}`}>
                {etape.titre}
              </p>
              <p className="mt-0.5 text-xs text-ardoise-500">{etape.detail}</p>
              {!etape.fait && (
                <Link
                  href={etape.lien}
                  className="mt-1 inline-block text-xs text-sky-700 hover:underline"
                >
                  {etape.libelleLien} →
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Carte>
  );
}
