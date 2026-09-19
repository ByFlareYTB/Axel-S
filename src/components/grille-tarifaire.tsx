'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge, Carte, Tableau, TitreSection } from '@/components/ui';
import type { OffrePromo, PricingRule } from '@/lib/types';

/**
 * Édition de la grille tarifaire : prix, coûts de production estimés et
 * activation de chaque ligne. Toute modification prend effet immédiatement
 * sur le configurateur de devis, sans redéploiement.
 */
export function GrilleTarifaire({
  reglesInitiales,
  promosInitiales,
  parametresInitiaux,
}: {
  reglesInitiales: PricingRule[];
  promosInitiales: OffrePromo[];
  parametresInitiaux: Record<string, string>;
}) {
  const router = useRouter();
  const [regles, setRegles] = useState(reglesInitiales);
  const [promos, setPromos] = useState(promosInitiales);
  const [parametres, setParametres] = useState(parametresInitiaux);
  const [message, setMessage] = useState<string | null>(null);
  const [, demarrer] = useTransition();

  async function enregistrerRegle(regle: PricingRule, patch: Partial<PricingRule>) {
    setRegles((actuelles) => actuelles.map((r) => (r.id === regle.id ? { ...r, ...patch } : r)));
    const reponse = await fetch(`/api/tarification/regles/${regle.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    setMessage(reponse.ok ? `« ${regle.nom} » mis à jour.` : 'Enregistrement impossible.');
    router.refresh();
  }

  async function basculerPromo(promo: OffrePromo) {
    const actif = !promo.actif;
    setPromos((actuelles) => actuelles.map((p) => (p.id === promo.id ? { ...p, actif } : p)));
    await fetch(`/api/tarification/promos/${promo.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actif }),
    });
    setMessage(`Offre ${promo.code} ${actif ? 'activée' : 'désactivée'}.`);
    router.refresh();
  }

  async function enregistrerParametre(cle: string, valeur: string) {
    setParametres((actuels) => ({ ...actuels, [cle]: valeur }));
    await fetch('/api/tarification/parametres', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cle, valeur }),
    });
    setMessage(`Paramètre ${cle} enregistré.`);
  }

  return (
    <div className="space-y-4">
      <Carte>
        <TitreSection>Grille tarifaire</TitreSection>
        <Tableau entetes={['Élément', 'Type', 'Prix', 'Unité', 'Coût IA', 'Coût hébergement', 'Actif']}>
          {regles.map((regle) => (
            <tr key={regle.id}>
              <td className="px-2 py-2">
                <span className="font-medium">{regle.nom}</span>
                <span className="block text-xs text-ardoise-500">{regle.description}</span>
              </td>
              <td className="px-2 py-2">
                <Badge ton={regle.type === 'base' ? 'info' : regle.type === 'abonnement' ? 'succes' : 'neutre'}>
                  {regle.type}
                </Badge>
              </td>
              <td className="px-2 py-2">
                <input
                  type="number"
                  step="1"
                  min="0"
                  defaultValue={regle.prix}
                  onBlur={(e) =>
                    demarrer(() => {
                      const prix = Number(e.target.value);
                      if (prix !== regle.prix) void enregistrerRegle(regle, { prix });
                    })
                  }
                  className="w-24 rounded border border-ardoise-200 px-2 py-1 text-sm tabular-nums"
                />
              </td>
              <td className="px-2 py-2 text-xs text-ardoise-500">{regle.unite}</td>
              <td className="px-2 py-2">
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  defaultValue={regle.cout_ia_estime}
                  onBlur={(e) =>
                    demarrer(() => {
                      const valeur = Number(e.target.value);
                      if (valeur !== regle.cout_ia_estime)
                        void enregistrerRegle(regle, { cout_ia_estime: valeur });
                    })
                  }
                  className="w-20 rounded border border-ardoise-200 px-2 py-1 text-sm tabular-nums"
                />
              </td>
              <td className="px-2 py-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={regle.cout_hebergement_mensuel}
                  onBlur={(e) =>
                    demarrer(() => {
                      const valeur = Number(e.target.value);
                      if (valeur !== regle.cout_hebergement_mensuel)
                        void enregistrerRegle(regle, { cout_hebergement_mensuel: valeur });
                    })
                  }
                  className="w-20 rounded border border-ardoise-200 px-2 py-1 text-sm tabular-nums"
                />
              </td>
              <td className="px-2 py-2">
                <input
                  type="checkbox"
                  checked={regle.actif}
                  onChange={(e) => demarrer(() => void enregistrerRegle(regle, { actif: e.target.checked }))}
                />
              </td>
            </tr>
          ))}
        </Tableau>
      </Carte>

      <Carte>
        <TitreSection>Offres de lancement dégressives</TitreSection>
        <ul className="space-y-2 text-sm">
          {promos.map((promo) => (
            <li key={promo.id} className="flex items-center justify-between gap-3">
              <span>
                <span className="font-medium">{promo.code}</span> — {promo.libelle}
                <span className="block text-xs text-ardoise-500">
                  {promo.type_remise} · valeur {promo.valeur} · durée {promo.duree_mois} mois
                </span>
              </span>
              <button
                type="button"
                onClick={() => demarrer(() => void basculerPromo(promo))}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  promo.actif ? 'bg-emerald-600 text-white' : 'border border-ardoise-300'
                }`}
              >
                {promo.actif ? 'Active' : 'Inactive'}
              </button>
            </li>
          ))}
        </ul>
      </Carte>

      <Carte>
        <TitreSection>Seuils et paramètres</TitreSection>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(parametres).map(([cle, valeur]) => (
            <label key={cle} className="text-sm">
              <span className="mb-1 block text-xs text-ardoise-500">{cle}</span>
              <input
                defaultValue={valeur}
                onBlur={(e) =>
                  demarrer(() => {
                    if (e.target.value !== valeur) void enregistrerParametre(cle, e.target.value);
                  })
                }
                className="w-full rounded-lg border border-ardoise-200 px-3 py-2"
              />
            </label>
          ))}
        </div>
      </Carte>

      {message && <p className="text-sm text-emerald-700">{message}</p>}
    </div>
  );
}
