// ---------------------------------------------------------------------------
// Types et présentation des notifications.
//
// Ce module est volontairement sans dépendance : il est importé aussi bien par
// les composants client que par la logique serveur. Y ajouter un import vers
// la base de données ferait basculer tout le bundle navigateur du côté serveur.
// ---------------------------------------------------------------------------

export type TypeNotification =
  | 'email_recu'
  | 'email_envoye'
  | 'client_confirme'
  | 'site_approuve'
  | 'modifications_demandees'
  | 'site_en_production'
  | 'devis_accepte'
  | 'paiement_encaisse'
  | 'paiement_echoue'
  | 'abonnement_suspendu'
  | 'alerte_marge'
  | 'prospects_trouves';

export type NiveauNotification = 'info' | 'succes' | 'alerte';

export interface Notification {
  id: string;
  type: TypeNotification;
  niveau: NiveauNotification;
  titre: string;
  message: string;
  /** Lien interne vers l'écran où traiter la notification. */
  lien: string | null;
  client_id: string | null;
  site_id: string | null;
  lu: boolean;
  lu_le: string | null;
  created_at: string;
}

/** Emoji et niveau par défaut de chaque type d'événement. */
export const PRESENTATION: Record<TypeNotification, { emoji: string; niveau: NiveauNotification }> = {
  email_recu: { emoji: '📥', niveau: 'info' },
  email_envoye: { emoji: '📤', niveau: 'info' },
  client_confirme: { emoji: '✅', niveau: 'succes' },
  site_approuve: { emoji: '👍', niveau: 'succes' },
  modifications_demandees: { emoji: '✏️', niveau: 'alerte' },
  site_en_production: { emoji: '🚀', niveau: 'succes' },
  devis_accepte: { emoji: '🧾', niveau: 'succes' },
  paiement_encaisse: { emoji: '💶', niveau: 'succes' },
  paiement_echoue: { emoji: '⚠️', niveau: 'alerte' },
  abonnement_suspendu: { emoji: '⛔', niveau: 'alerte' },
  alerte_marge: { emoji: '📉', niveau: 'alerte' },
  prospects_trouves: { emoji: '🔎', niveau: 'info' },
};

/** Libellé lisible de chaque type, pour les filtres et la page dédiée. */
export const LIBELLES: Record<TypeNotification, string> = {
  email_recu: 'Email reçu',
  email_envoye: 'Email envoyé',
  client_confirme: 'Client confirmé',
  site_approuve: 'Site approuvé',
  modifications_demandees: 'Modifications demandées',
  site_en_production: 'Mise en production',
  devis_accepte: 'Devis accepté',
  paiement_encaisse: 'Paiement encaissé',
  paiement_echoue: 'Paiement échoué',
  abonnement_suspendu: 'Abonnement suspendu',
  alerte_marge: 'Alerte de marge',
  prospects_trouves: 'Prospects trouvés',
};
