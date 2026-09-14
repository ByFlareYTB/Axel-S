// ---------------------------------------------------------------------------
// Générateur PDF minimal, sans dépendance.
//
// Produit un PDF 1.4 valide en A4 avec les polices standard Helvetica
// (toujours présentes dans les lecteurs, aucune police à embarquer) et
// l'encodage WinAnsi, qui couvre les accents français.
// ---------------------------------------------------------------------------

export type Police = 'normal' | 'gras';

interface Operation {
  type: 'texte' | 'ligne' | 'rectangle' | 'saut';
  [key: string]: unknown;
}

const A4 = { largeur: 595.28, hauteur: 841.89 };
const MARGE = 48;

/** Largeurs Helvetica (unités/1000) suffisantes pour aligner du texte à droite. */
const LARGEURS: Record<string, number> = {
  ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556,
  '8': 556, '9': 556, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556,
  '@': 1015, A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722,
  I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722,
  S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500, '{': 334, '|': 260, '}': 334,
  '~': 584, '€': 556,
};

export function largeurTexte(texte: string, taille: number, police: Police = 'normal'): number {
  // Helvetica-Bold est ~5 % plus large que Helvetica : approximation suffisante
  // pour un alignement à droite de montants.
  const facteur = police === 'gras' ? 1.05 : 1;
  let total = 0;
  for (const c of texte) total += LARGEURS[c] ?? 556;
  return (total / 1000) * taille * facteur;
}

/**
 * Caractères que WinAnsi place dans la plage 0x80-0x9F, là où Unicode les
 * situe bien plus haut. Sans cette table, « € » et les apostrophes typographiques
 * ressortent en caractères parasites dans le PDF.
 */
const WINANSI_HAUT: Record<string, number> = {
  '\u20AC': 0x80, '\u201A': 0x82, '\u0192': 0x83, '\u201E': 0x84, '\u2026': 0x85,
  '\u2020': 0x86, '\u2021': 0x87, '\u02C6': 0x88, '\u2030': 0x89, '\u0160': 0x8a,
  '\u2039': 0x8b, '\u0152': 0x8c, '\u017D': 0x8e, '\u2018': 0x91, '\u2019': 0x92,
  '\u201C': 0x93, '\u201D': 0x94, '\u2022': 0x95, '\u2013': 0x96, '\u2014': 0x97,
  '\u02DC': 0x98, '\u2122': 0x99, '\u0161': 0x9a, '\u203A': 0x9b, '\u0153': 0x9c,
  '\u017E': 0x9e, '\u0178': 0x9f,
};

/** Convertit une chaîne Unicode en octets WinAnsi, caractère par caractère. */
function versWinAnsi(texte: string): string {
  let sortie = '';
  for (const caractere of texte) {
    const remplacement = WINANSI_HAUT[caractere];
    if (remplacement !== undefined) {
      sortie += String.fromCharCode(remplacement);
    } else if (caractere.codePointAt(0)! <= 0xff) {
      sortie += caractere;
    } else {
      // Hors jeu WinAnsi : on retombe sur un caractère imprimable plutôt que
      // de laisser un octet aléatoire.
      sortie += '?';
    }
  }
  return sortie;
}

/** Échappe les caractères réservés d'une chaîne littérale PDF. */
function echapper(texte: string): string {
  return versWinAnsi(texte)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

export class DocumentPdf {
  private ops: Operation[] = [];
  private y = A4.hauteur - MARGE;

  get curseurY(): number {
    return this.y;
  }

  set curseurY(valeur: number) {
    this.y = valeur;
  }

  get largeurUtile(): number {
    return A4.largeur - 2 * MARGE;
  }

  texte(
    contenu: string,
    options: { x?: number; taille?: number; police?: Police; gris?: number; alignerDroite?: number } = {},
  ): this {
    const taille = options.taille ?? 10;
    const police = options.police ?? 'normal';
    const x =
      options.alignerDroite !== undefined
        ? options.alignerDroite - largeurTexte(contenu, taille, police)
        : (options.x ?? MARGE);
    this.ops.push({ type: 'texte', contenu, x, y: this.y, taille, police, gris: options.gris ?? 0 });
    return this;
  }

  /** Écrit une ligne puis descend le curseur. */
  ligneTexte(contenu: string, options: Parameters<DocumentPdf['texte']>[1] = {}): this {
    this.texte(contenu, options);
    this.y -= (options.taille ?? 10) + 4;
    return this;
  }

  saut(hauteur = 10): this {
    this.y -= hauteur;
    return this;
  }

  trait(options: { gris?: number; epaisseur?: number } = {}): this {
    this.ops.push({
      type: 'ligne',
      x1: MARGE,
      x2: A4.largeur - MARGE,
      y: this.y,
      gris: options.gris ?? 0.8,
      epaisseur: options.epaisseur ?? 0.5,
    });
    this.y -= 8;
    return this;
  }

  rectangle(hauteur: number, gris = 0.95): this {
    this.ops.push({
      type: 'rectangle',
      x: MARGE,
      y: this.y - hauteur + 12,
      largeur: this.largeurUtile,
      hauteur,
      gris,
    });
    return this;
  }

  /** Coupe un paragraphe pour qu'il tienne dans la largeur utile. */
  paragraphe(contenu: string, options: { taille?: number; gris?: number } = {}): this {
    const taille = options.taille ?? 9;
    const mots = contenu.split(/\s+/);
    let ligne = '';
    for (const mot of mots) {
      const essai = ligne ? `${ligne} ${mot}` : mot;
      if (largeurTexte(essai, taille) > this.largeurUtile && ligne) {
        this.ligneTexte(ligne, { taille, gris: options.gris });
        ligne = mot;
      } else {
        ligne = essai;
      }
    }
    if (ligne) this.ligneTexte(ligne, { taille, gris: options.gris });
    return this;
  }

  get margeGauche(): number {
    return MARGE;
  }

  get bordDroit(): number {
    return A4.largeur - MARGE;
  }

  private fluxContenu(): string {
    const parts: string[] = [];
    for (const op of this.ops) {
      if (op.type === 'rectangle') {
        parts.push(
          `q ${op.gris} g ${op.x} ${op.y} ${op.largeur} ${op.hauteur} re f Q`,
        );
      } else if (op.type === 'ligne') {
        parts.push(
          `q ${op.gris} G ${op.epaisseur} w ${op.x1} ${op.y} m ${op.x2} ${op.y} l S Q`,
        );
      } else if (op.type === 'texte') {
        const police = op.police === 'gras' ? '/F2' : '/F1';
        parts.push(
          `BT ${op.gris} g ${police} ${op.taille} Tf ${op.x} ${op.y} Td (${echapper(String(op.contenu))}) Tj ET`,
        );
      }
    }
    return parts.join('\n');
  }

  /** Sérialise le document. Les accents passent par l'encodage latin1/WinAnsi. */
  build(): Uint8Array {
    const flux = this.fluxContenu();
    const fluxBytes = Buffer.from(flux, 'latin1');

    const objets = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.largeur} ${A4.hauteur}] ` +
        '/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
      `<< /Length ${fluxBytes.length} >>\nstream\n${flux}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    ];

    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [];
    for (const [index, objet] of objets.entries()) {
      offsets.push(Buffer.byteLength(pdf, 'latin1'));
      pdf += `${index + 1} 0 obj\n${objet}\nendobj\n`;
    }

    const xrefOffset = Buffer.byteLength(pdf, 'latin1');
    pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) {
      pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    }
    pdf +=
      `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\n` +
      `startxref\n${xrefOffset}\n%%EOF\n`;

    return new Uint8Array(Buffer.from(pdf, 'latin1'));
  }
}
