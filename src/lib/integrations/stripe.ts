// ---------------------------------------------------------------------------
// Stripe : encaissement de la prestation initiale (paiement unique) et
// abonnement récurrent Hébergement & Maintenance.
// ---------------------------------------------------------------------------

import Stripe from 'stripe';
import { config } from '@/lib/config';

let instance: Stripe | null = null;

export function stripe(): Stripe {
  if (!config.stripe.secretKey) {
    throw new Error('STRIPE_SECRET_KEY est requis pour la facturation réelle.');
  }
  instance ??= new Stripe(config.stripe.secretKey);
  return instance;
}

export async function creerOuRecupererClient(params: {
  email: string;
  nom: string;
  stripeCustomerId?: string | null;
}): Promise<string> {
  if (params.stripeCustomerId) return params.stripeCustomerId;
  const client = await stripe().customers.create({ email: params.email, name: params.nom });
  return client.id;
}

/** Lien de paiement pour la prestation initiale. */
export async function creerPaiementUnique(params: {
  customerId: string;
  montantEuros: number;
  libelle: string;
  reference: string;
}): Promise<{ url: string; sessionId: string }> {
  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    customer: params.customerId,
    client_reference_id: params.reference,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: Math.round(params.montantEuros * 100),
          product_data: { name: params.libelle },
        },
      },
    ],
    success_url: `${config.appBaseUrl}/facturation?paiement=ok`,
    cancel_url: `${config.appBaseUrl}/facturation?paiement=annule`,
  });
  return { url: session.url ?? '', sessionId: session.id };
}

/** Abonnement mensuel, avec remise de lancement facultative. */
export async function creerAbonnement(params: {
  customerId: string;
  montantMensuelEuros: number;
  libelle: string;
  moisOfferts?: number;
}): Promise<{ url: string; sessionId: string }> {
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer: params.customerId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: Math.round(params.montantMensuelEuros * 100),
          recurring: { interval: 'month' },
          product_data: { name: params.libelle },
        },
      },
    ],
    subscription_data: params.moisOfferts
      ? { trial_period_days: params.moisOfferts * 30 }
      : undefined,
    success_url: `${config.appBaseUrl}/facturation?abonnement=ok`,
    cancel_url: `${config.appBaseUrl}/facturation?abonnement=annule`,
  });
  return { url: session.url ?? '', sessionId: session.id };
}

export function verifierWebhook(corps: string, signature: string): Stripe.Event {
  return stripe().webhooks.constructEvent(corps, signature, config.stripe.webhookSecret);
}
