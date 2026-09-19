import { erreur, erreurInterne } from '@/lib/api';
import { db } from '@/lib/db';
import { genererFacturePdf } from '@/lib/pdf/documents';
import type { Client, Facture } from '@/lib/types';

export async function GET(_requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const facture = await db.get<Facture>('factures', id);
    if (!facture) return erreur('Facture introuvable.', 404);

    const client = await db.get<Client>('clients', facture.client_id);
    if (!client) return erreur('Client introuvable.', 404);

    const pdf = genererFacturePdf(facture, client);
    return new Response(pdf as BodyInit, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${facture.numero}.pdf"`,
      },
    });
  } catch (err) {
    return erreurInterne(err);
  }
}
