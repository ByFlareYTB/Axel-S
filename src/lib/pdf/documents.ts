// ---------------------------------------------------------------------------
// Devis et factures PDF conformes aux obligations d'une microentreprise :
// identité et SIREN de l'émetteur, identité du client, numéro unique, date,
// détail des prestations, total, mention de franchise de TVA (art. 293 B du
// CGI) et mentions de retard de paiement.
// ---------------------------------------------------------------------------

import { config, dateFr, euros } from '@/lib/config';
import type { Client, Devis, Facture, LigneDevis } from '@/lib/types';
import { DocumentPdf } from './simple-pdf';

function entete(pdf: DocumentPdf, titre: string, numero: string): void {
  const e = config.entreprise;
  pdf.ligneTexte(e.nom, { taille: 20, police: 'gras' });
  pdf.ligneTexte(`${e.exploitant} — Microentreprise`, { taille: 9, gris: 0.35 });
  pdf.ligneTexte(e.adresse, { taille: 9, gris: 0.35 });
  pdf.ligneTexte(`SIREN ${e.siren}`, { taille: 9, gris: 0.35 });
  if (e.email) pdf.ligneTexte(e.email, { taille: 9, gris: 0.35 });
  if (e.telephone) pdf.ligneTexte(e.telephone, { taille: 9, gris: 0.35 });

  // Titre et numéro alignés à droite, à la hauteur du bloc émetteur.
  const yCourant = pdf.curseurY;
  pdf.curseurY = 793;
  pdf.texte(titre.toUpperCase(), { taille: 20, police: 'gras', alignerDroite: pdf.bordDroit });
  pdf.curseurY = 773;
  pdf.texte(numero, { taille: 11, alignerDroite: pdf.bordDroit, gris: 0.35 });
  pdf.curseurY = yCourant;

  pdf.saut(6).trait();
}

function blocClient(pdf: DocumentPdf, client: Client): void {
  pdf.saut(4);
  pdf.ligneTexte('CLIENT', { taille: 8, police: 'gras', gris: 0.45 });
  pdf.ligneTexte(client.raison_sociale, { taille: 11, police: 'gras' });
  if (client.contact_nom) pdf.ligneTexte(client.contact_nom, { taille: 9, gris: 0.35 });
  const adresse = [client.adresse, [client.code_postal, client.ville].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(' — ');
  if (adresse) pdf.ligneTexte(adresse, { taille: 9, gris: 0.35 });
  if (client.siret) pdf.ligneTexte(`SIRET ${client.siret}`, { taille: 9, gris: 0.35 });
  pdf.ligneTexte(client.email, { taille: 9, gris: 0.35 });
  pdf.saut(8);
}

function tableauLignes(pdf: DocumentPdf, lignes: LigneDevis[]): void {
  const colQuantite = pdf.bordDroit - 190;
  const colPrix = pdf.bordDroit - 100;

  pdf.rectangle(18, 0.93);
  pdf.texte('PRESTATION', { taille: 8, police: 'gras', gris: 0.3 });
  pdf.texte('QTÉ', { taille: 8, police: 'gras', gris: 0.3, alignerDroite: colQuantite });
  pdf.texte('P.U.', { taille: 8, police: 'gras', gris: 0.3, alignerDroite: colPrix });
  pdf.texte('TOTAL', { taille: 8, police: 'gras', gris: 0.3, alignerDroite: pdf.bordDroit });
  pdf.saut(20);

  for (const ligne of lignes) {
    const suffixe = ligne.type === 'abonnement' ? ' (par mois)' : '';
    // Le libellé peut être long : on le tronque plutôt que de déborder sur la colonne Qté.
    let libelle = `${ligne.nom}${suffixe}`;
    while (libelle.length > 58) libelle = libelle.slice(0, -1);
    if (libelle !== `${ligne.nom}${suffixe}`) libelle = `${libelle.trimEnd()}…`;

    pdf.texte(libelle, { taille: 9 });
    pdf.texte(String(ligne.quantite), { taille: 9, alignerDroite: colQuantite });
    pdf.texte(euros(ligne.prix_unitaire), { taille: 9, alignerDroite: colPrix });
    pdf.texte(euros(ligne.total), { taille: 9, police: 'gras', alignerDroite: pdf.bordDroit });
    pdf.saut(16);
  }

  pdf.trait({ gris: 0.85 });
}

function totalLigne(pdf: DocumentPdf, libelle: string, montant: string, gras = false): void {
  pdf.texte(libelle, {
    taille: gras ? 11 : 9,
    police: gras ? 'gras' : 'normal',
    alignerDroite: pdf.bordDroit - 110,
    gris: gras ? 0 : 0.35,
  });
  pdf.texte(montant, {
    taille: gras ? 11 : 9,
    police: gras ? 'gras' : 'normal',
    alignerDroite: pdf.bordDroit,
  });
  pdf.saut(gras ? 20 : 15);
}

function piedDePage(pdf: DocumentPdf): void {
  pdf.curseurY = 110;
  pdf.trait({ gris: 0.85 });
  pdf.ligneTexte(config.entreprise.mentionTva, { taille: 8, police: 'gras', gris: 0.3 });
  pdf.paragraphe(config.entreprise.mentionRetard, { taille: 7.5, gris: 0.45 });
  pdf.paragraphe(
    `${config.entreprise.nom} — ${config.entreprise.exploitant}, microentreprise — SIREN ${config.entreprise.siren} — ${config.entreprise.adresse}`,
    { taille: 7.5, gris: 0.55 },
  );
}

export function genererDevisPdf(devis: Devis, client: Client): Uint8Array {
  const pdf = new DocumentPdf();
  entete(pdf, 'Devis', devis.numero);
  blocClient(pdf, client);

  pdf.ligneTexte(`Date : ${dateFr(devis.created_at)}`, { taille: 9, gris: 0.35 });
  if (devis.valide_jusqu_au) {
    pdf.ligneTexte(`Valable jusqu'au : ${dateFr(devis.valide_jusqu_au)}`, { taille: 9, gris: 0.35 });
  }
  pdf.saut(10);

  tableauLignes(pdf, devis.options_selectionnees);
  pdf.saut(6);

  const mensuelles = devis.options_selectionnees.filter((l) => l.type === 'abonnement');

  totalLigne(pdf, 'Prestation initiale', euros(devis.total_oneshot + devis.remise));
  if (devis.remise > 0) {
    totalLigne(pdf, `Remise${devis.promo_code ? ` (${devis.promo_code})` : ''}`, `− ${euros(devis.remise)}`);
  }
  totalLigne(pdf, 'Total à régler', euros(devis.total_oneshot), true);
  if (mensuelles.length > 0) {
    totalLigne(pdf, 'Puis par mois', `${euros(devis.total_mensuel)} / mois`);
  }

  pdf.saut(14);
  pdf.paragraphe(
    'Règlement de la prestation initiale à la commande. L\'abonnement Hébergement & Maintenance est prélevé mensuellement et résiliable à tout moment.',
    { taille: 8, gris: 0.45 },
  );
  pdf.saut(6);
  pdf.ligneTexte('Bon pour accord (date et signature) :', { taille: 9, gris: 0.35 });

  piedDePage(pdf);
  return pdf.build();
}

export function genererFacturePdf(facture: Facture, client: Client): Uint8Array {
  const pdf = new DocumentPdf();
  entete(pdf, 'Facture', facture.numero);
  blocClient(pdf, client);

  pdf.ligneTexte(`Date d'émission : ${dateFr(facture.date)}`, { taille: 9, gris: 0.35 });
  if (facture.date_echeance) {
    pdf.ligneTexte(`Échéance : ${dateFr(facture.date_echeance)}`, { taille: 9, gris: 0.35 });
  }
  if (facture.date_paiement) {
    pdf.ligneTexte(`Payée le ${dateFr(facture.date_paiement)} (${facture.moyen_paiement ?? '—'})`, {
      taille: 9,
      gris: 0.35,
    });
  }
  pdf.saut(10);

  tableauLignes(pdf, facture.lignes);
  pdf.saut(6);

  totalLigne(pdf, 'Total HT', euros(facture.total_ht));
  totalLigne(pdf, 'TVA', euros(facture.tva));
  totalLigne(pdf, 'Total à payer', euros(facture.total_ttc), true);

  piedDePage(pdf);
  return pdf.build();
}
