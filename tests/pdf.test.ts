import { describe, expect, it } from 'vitest';
import { genererDevisPdf, genererFacturePdf } from '@/lib/pdf/documents';
import type { Client, Devis, Facture, LigneDevis } from '@/lib/types';

const CLIENT: Client = {
  id: 'c1',
  prospect_id: null,
  raison_sociale: 'Boulangerie Le Fournil',
  contact_nom: 'Claire Bertin',
  email: 'contact@fournil.fr',
  telephone: '02 47 26 11 04',
  siret: '80123456700018',
  secteur: 'Boulangerie',
  adresse: '12 rue Mère-Dieu',
  code_postal: '37260',
  ville: 'Monts',
  stripe_customer_id: null,
  created_at: '2026-01-05T09:00:00.000Z',
  updated_at: '2026-01-05T09:00:00.000Z',
};

const LIGNES: LigneDevis[] = [
  {
    code: 'base_site_essentiel',
    nom: 'Base « Site Essentiel » (paiement unique)',
    type: 'base',
    prix_unitaire: 249,
    quantite: 1,
    total: 249,
  },
  {
    code: 'abo_hebergement',
    nom: 'Abonnement Hébergement & Maintenance',
    type: 'abonnement',
    prix_unitaire: 19,
    quantite: 1,
    total: 19,
  },
];

const DEVIS: Devis = {
  id: 'd1',
  numero: 'DEV-2026-0001',
  client_id: 'c1',
  site_id: null,
  options_selectionnees: LIGNES,
  promo_code: null,
  total_oneshot: 249,
  total_mensuel: 19,
  remise: 0,
  total: 249,
  cout_ia_estime: 4.5,
  cout_hebergement_estime: 0.45,
  cout_acquisition_ads: 0,
  marge_oneshot: 244.5,
  marge_oneshot_pct: 98.19,
  marge_mensuelle: 18.55,
  alerte_marge: false,
  statut: 'envoye',
  pdf_url: null,
  envoye_le: '2026-01-06T09:00:00.000Z',
  accepte_le: null,
  valide_jusqu_au: '2026-02-05',
  created_at: '2026-01-06T09:00:00.000Z',
  updated_at: '2026-01-06T09:00:00.000Z',
};

const FACTURE: Facture = {
  id: 'f1',
  numero: 'FAC-2026-0001',
  devis_id: 'd1',
  client_id: 'c1',
  abonnement_id: null,
  lignes: [LIGNES[0]],
  total_ht: 249,
  tva: 0,
  total_ttc: 249,
  statut_paiement: 'payee',
  moyen_paiement: 'stripe',
  stripe_payment_intent: null,
  date: '2026-01-07',
  date_echeance: '2026-01-22',
  date_paiement: '2026-01-07T10:00:00.000Z',
  pdf_url: null,
  created_at: '2026-01-07T10:00:00.000Z',
  updated_at: '2026-01-07T10:00:00.000Z',
};

function enTexte(octets: Uint8Array): string {
  return Buffer.from(octets).toString('latin1');
}

describe('génération des pièces PDF', () => {
  it('produit un PDF structurellement valide', () => {
    const pdf = enTexte(genererDevisPdf(DEVIS, CLIENT));
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pdf).toContain('/Type /Catalog');
    expect(pdf).toContain('xref');
  });

  it('déclare la table xref avec le bon nombre d’objets', () => {
    const pdf = enTexte(genererDevisPdf(DEVIS, CLIENT));
    const entrees = pdf.match(/\d{10} 00000 n/g) ?? [];
    expect(entrees).toHaveLength(6);
    expect(pdf).toContain('/Size 7');
  });

  it('inscrit le numéro, le client et son SIRET sur le devis', () => {
    const pdf = enTexte(genererDevisPdf(DEVIS, CLIENT));
    expect(pdf).toContain('DEV-2026-0001');
    expect(pdf).toContain('Boulangerie Le Fournil');
    expect(pdf).toContain('SIRET 80123456700018');
  });

  it('porte les mentions obligatoires de la microentreprise', () => {
    const pdf = enTexte(genererFacturePdf(FACTURE, CLIENT));
    expect(pdf).toContain('TVA non applicable, art. 293 B du CGI');
    expect(pdf).toContain('FAC-2026-0001');
  });

  it('encode l’euro en WinAnsi plutôt qu’en Unicode tronqué', () => {
    const pdf = enTexte(genererDevisPdf(DEVIS, CLIENT));
    // 0x80 est la position de l'euro dans WinAnsi ; retrouver le point de code
    // Unicode brut signalerait une troncature latin1 qui casse l'affichage.
    expect(pdf).toContain(String.fromCharCode(0x80));
    expect(pdf).not.toContain(String.fromCharCode(0x20ac));
  });

  it('échappe les parenthèses d’un libellé sans casser le flux', () => {
    const pdf = enTexte(genererDevisPdf(DEVIS, CLIENT));
    expect(pdf).toContain('\\(paiement unique\\)');
  });
});
