// ---------------------------------------------------------------------------
// Petit client HTTP commun aux intégrations : timeout, erreurs lisibles.
// ---------------------------------------------------------------------------

export class IntegrationError extends Error {
  constructor(
    readonly service: string,
    message: string,
    readonly status?: number,
  ) {
    super(`[${service}] ${message}`);
    this.name = 'IntegrationError';
  }
}

export async function requeteJson<T>(
  service: string,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 30_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const reponse = await fetch(url, { ...rest, signal: controller.signal });
    const texte = await reponse.text();
    if (!reponse.ok) {
      throw new IntegrationError(service, texte.slice(0, 400) || reponse.statusText, reponse.status);
    }
    return texte ? (JSON.parse(texte) as T) : ({} as T);
  } catch (err) {
    if (err instanceof IntegrationError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new IntegrationError(service, `délai dépassé après ${timeoutMs} ms`);
    }
    throw new IntegrationError(service, err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}
