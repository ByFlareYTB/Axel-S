import { fermerSession } from '@/lib/auth/session';
import { ok } from '@/lib/api';

export async function POST() {
  await fermerSession();
  return ok({ ok: true });
}
