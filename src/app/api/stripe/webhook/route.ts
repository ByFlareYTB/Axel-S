import type Stripe from 'stripe';
import { erreur, erreurInterne, ok } from '@/lib/api';
import { config } from '@/lib/config';
import { db } from '@/lib/db';
import { verifierWebhook } from '@/lib/integrations/stripe';
import { marquerPayee, traiterEchecPaiement } from '@/lib/pipeline/facturation';
import type { Abonnement, Facture } from '@/lib/types';

/**
 * Webhook Stripe : encaissements et échecs de prélèvement.
 * La signature est vérifiée avant tout traitement.
 */
export async function POST(requete: Request) {
  if (config.demo) return erreur('Webhook désactivé en mode démo.', 400);

  const signature = requete.headers.get('stripe-signature');
  if (!signature) return erreur('Signature Stripe manquante.', 400);

  let evenement: Stripe.Event;
  try {
    evenement = verifierWebhook(await requete.text(), signature);
  } catch (err) {
    return erreur(`Signature invalide : ${err instanceof Error ? err.message : 'inconnue'}`, 400);
  }

  try {
    switch (evenement.type) {
      case 'checkout.session.completed':
      case 'invoice.paid': {
        const reference =
          'client_reference_id' in evenement.data.object
            ? (evenement.data.object.client_reference_id ?? null)
            : null;
        if (reference) {
          const facture = await db.findOne<Facture>('factures', { numero: reference });
          if (facture) await marquerPayee(facture.id);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const facture = evenement.data.object as Stripe.Invoice;
        // Depuis l'API 2025, l'abonnement d'origine vit sous `parent`.
        const source = facture.parent?.subscription_details?.subscription ?? null;
        const abonnementStripe = typeof source === 'string' ? source : (source?.id ?? null);
        if (abonnementStripe) {
          const abonnement = await db.findOne<Abonnement>('abonnements', {
            stripe_subscription_id: abonnementStripe,
          });
          if (abonnement) await traiterEchecPaiement(abonnement.id);
        }
        break;
      }

      default:
        break;
    }
    return ok({ recu: true });
  } catch (err) {
    return erreurInterne(err);
  }
}
