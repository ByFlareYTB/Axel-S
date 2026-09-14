-- ---------------------------------------------------------------------------
-- SiteForge AI — 0003 : grille tarifaire par défaut.
-- Valeurs indicatives, modifiables depuis Paramètres > Tarification
-- (aucun redéploiement nécessaire : tout passe par la table pricing_rules).
--
-- Positionnement : nettement sous la fourchette du marché français 2026
-- (freelance junior 500–2 000 €, confirmé 1 500–5 000 €, agence 3 000–8 000 €)
-- pour un coût de production réel de 3 à 10 € par site.
-- ---------------------------------------------------------------------------

insert into pricing_rules
  (code, nom, type, prix, unite, quantifiable, description, cout_ia_estime, cout_hebergement_mensuel, ordre)
values
  ('base_site_essentiel', 'Base « Site Essentiel » (paiement unique)', 'base', 249.00, 'forfait', false,
   'Génération IA complète, jusqu''à 5 pages, design sur-mesure par secteur, responsive, formulaire de contact, SEO de base, déploiement test + production automatisé',
   4.50, 0, 1),

  ('abo_hebergement', 'Abonnement Hébergement & Maintenance', 'abonnement', 19.00, 'mois', false,
   'Hébergement (Vercel/Cloudflare), certificat SSL, sauvegardes, monitoring, 2 mises à jour de contenu incluses par an',
   0, 0.45, 2),

  ('page_supplementaire', 'Page supplémentaire', 'option', 29.00, 'page', true,
   'Page additionnelle générée et intégrée par l''IA',
   0.80, 0.02, 3),

  ('module_reservation', 'Système de réservation / rendez-vous en ligne', 'option', 89.00, 'forfait', false,
   'Module de prise de RDV intégré au site',
   1.20, 0.05, 4),

  ('boutique_stripe', 'Boutique en ligne (paiement Stripe)', 'option', 199.00, 'forfait', false,
   'Catalogue produits + paiement en ligne',
   2.50, 0.10, 5),

  ('multilingue', 'Multilingue', 'option', 39.00, 'langue', true,
   'Traduction IA + adaptation SEO par langue',
   0.60, 0.02, 6),

  ('refonte_premium', 'Refonte design premium (animations, sur-mesure poussé)', 'option', 99.00, 'forfait', false,
   'Templates avancés, direction artistique renforcée',
   1.50, 0, 7),

  ('redaction_photo_ia', 'Rédaction et retouche photo IA', 'option', 49.00, 'forfait', false,
   'Optimisation visuelle du contenu fourni par le client',
   0.90, 0, 8),

  ('livraison_express', 'Livraison express (48h)', 'option', 79.00, 'forfait', false,
   'Priorité de génération et de validation',
   0.30, 0, 9),

  ('maj_ponctuelle', 'Mise à jour ponctuelle hors abonnement', 'option', 25.00, 'forfait', true,
   'Modification à la demande, hors forfait maintenance',
   0.25, 0, 10),

  ('pack_visibilite', 'Pack visibilité (fiche Google Business + réseaux sociaux)', 'option', 59.00, 'forfait', false,
   'Configuration des profils publics liés au site',
   0.20, 0, 11)
on conflict (code) do nothing;

-- --- Offres de lancement dégressives (désactivées par défaut) ---------------
insert into offres_promo (code, libelle, type_remise, valeur, duree_mois, actif)
values
  ('LANCEMENT30', '-30 % sur les 3 premiers mois d''abonnement', 'pourcentage_abonnement', 30, 3, false),
  ('PREMIERMOIS', '1er mois d''hébergement offert', 'mois_offerts', 1, 1, false),
  ('OUVERTURE20', '-20 % sur la prestation initiale', 'pourcentage_oneshot', 20, 0, false)
on conflict (code) do nothing;

-- --- Paramètres de marge (seuils d'alerte) ---------------------------------
create table if not exists parametres (
  cle         text primary key,
  valeur      text not null,
  description text,
  updated_at  timestamptz not null default now()
);

insert into parametres (cle, valeur, description) values
  ('marge_min_oneshot_pct', '70', 'Alerte si la marge sur la prestation initiale passe sous ce pourcentage'),
  ('marge_min_abonnement_eur', '12', 'Alerte si la marge nette mensuelle de l''abonnement passe sous ce montant (€)'),
  ('cout_ia_par_page_eur', '0.80', 'Coût moyen d''un appel de génération IA par page'),
  ('cout_hebergement_mensuel_eur', '0.45', 'Coût réel mensuel d''hébergement mutualisé par site'),
  ('delai_suspension_impaye_jours', '15', 'Délai avant suspension du site après échec de paiement'),
  ('validite_devis_jours', '30', 'Durée de validité d''un devis'),
  ('retention_prospect_mois', '36', 'RGPD : conservation limitée à 3 ans après le dernier contact actif')
on conflict (cle) do nothing;
