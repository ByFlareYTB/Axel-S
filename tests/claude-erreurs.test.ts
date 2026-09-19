import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { entetesAnthropic, traduireErreur } from '@/lib/integrations/claude';

const ENV_INITIAL = { ...process.env };

function erreurApi(status: number, message: string) {
  return new Anthropic.APIError(status, { error: { message } }, message, new Headers());
}

describe('traduction des erreurs de l’API Claude', () => {
  it('explique une clé non rattachée à un workspace', () => {
    const traduite = traduireErreur(
      erreurApi(400, 'This API key is not scoped to a workspace, so this request must include…'),
    );
    // Les deux issues possibles doivent figurer dans le message.
    expect(traduite.message).toContain('ANTHROPIC_WORKSPACE_ID');
    expect(traduite.message).toContain('API keys');
  });

  it('explique un crédit épuisé', () => {
    expect(traduireErreur(erreurApi(400, 'Your credit balance is too low')).message).toContain(
      'Billing',
    );
  });

  it('explique une clé refusée', () => {
    const traduite = traduireErreur(
      new Anthropic.AuthenticationError(401, { error: {} }, 'invalid x-api-key', new Headers()),
    );
    expect(traduite.message).toContain('ANTHROPIC_API_KEY');
  });

  it('explique une limite de débit', () => {
    const traduite = traduireErreur(
      new Anthropic.RateLimitError(429, { error: {} }, 'rate limit', new Headers()),
    );
    expect(traduite.message).toContain('Patientez');
  });

  it('conserve le code et le message pour un cas non prévu', () => {
    const traduite = traduireErreur(erreurApi(503, 'upstream unavailable'));
    expect(traduite.message).toContain('503');
    expect(traduite.message).toContain('upstream unavailable');
  });

  it('laisse passer une erreur qui ne vient pas de l’API', () => {
    const reseau = new Error('coupure réseau');
    expect(traduireErreur(reseau)).toBe(reseau);
  });

  it('enveloppe une valeur jetée qui n’est pas une Error', () => {
    expect(traduireErreur('panne').message).toBe('panne');
  });
});

describe('en-têtes envoyés à l’API', () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_WORKSPACE_ID;
  });

  afterEach(() => {
    process.env = { ...ENV_INITIAL };
  });

  it('n’envoie aucun en-tête de workspace par défaut', () => {
    // Envoyer l'en-tête à tort provoque un refus : il doit rester absent.
    expect(entetesAnthropic()).toBeUndefined();
  });

  it('ajoute l’en-tête quand un workspace est configuré', () => {
    process.env.ANTHROPIC_WORKSPACE_ID = 'wrkspc_123';
    expect(entetesAnthropic()).toEqual({ 'anthropic-workspace-id': 'wrkspc_123' });
  });

  it('ignore une valeur vide ou faite d’espaces', () => {
    process.env.ANTHROPIC_WORKSPACE_ID = '   ';
    expect(entetesAnthropic()).toBeUndefined();
  });
});
