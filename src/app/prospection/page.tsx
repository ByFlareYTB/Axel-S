import { TitrePage } from '@/components/ui';
import { TableauProspects } from '@/components/prospects-table';
import { getProspects, getRecherches } from '@/lib/repositories';

export const dynamic = 'force-dynamic';

export default async function ProspectionPage() {
  const [prospects, recherches] = await Promise.all([getProspects(), getRecherches(5)]);
  const coutTotal = recherches.reduce((s, r) => s + r.cout_estime, 0);

  return (
    <>
      <TitrePage
        titre="Recherche client"
        sousTitre="Croisement SIRENE (identité légale, SIRET) et Perplexity (empreinte web). Déduplication par SIRET."
      />
      <TableauProspects
        prospectsInitiaux={prospects}
        dernieresRecherches={recherches}
        coutRecherchesEuros={coutTotal}
      />
    </>
  );
}
