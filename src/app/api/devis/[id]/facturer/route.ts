import { erreurInterne, ok } from '@/lib/api';
import { facturerDevis } from '@/lib/pipeline/facturation';

/** Transforme un devis accepté en facture + abonnement récurrent. */
export async function POST(_requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return ok(await facturerDevis(id), 201);
  } catch (err) {
    return erreurInterne(err);
  }
}
