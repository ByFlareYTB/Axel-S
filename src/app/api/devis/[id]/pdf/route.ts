import { erreur, erreurInterne } from '@/lib/api';
import { db } from '@/lib/db';
import { genererDevisPdf } from '@/lib/pdf/documents';
import type { Client, Devis } from '@/lib/types';

export async function GET(_requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const devis = await db.get<Devis>('devis', id);
    if (!devis) return erreur('Devis introuvable.', 404);

    const client = await db.get<Client>('clients', devis.client_id);
    if (!client) return erreur('Client introuvable.', 404);

    const pdf = genererDevisPdf(devis, client);
    return new Response(pdf as BodyInit, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${devis.numero}.pdf"`,
      },
    });
  } catch (err) {
    return erreurInterne(err);
  }
}
