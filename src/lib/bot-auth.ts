import crypto from 'node:crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BotAuthResult =
  | { ok: true; trainerId: string }
  | { ok: false; reason: string };

export function requireBotSecret(request: Request): BotAuthResult {
  const envSecret = (process.env.BOT_PORTAL_SHARED_SECRET ?? '').trim();
  if (!envSecret) return { ok: false, reason: 'server-misconfigured' };

  const headerSecret = request.headers.get('X-Bot-Secret') ?? '';
  const a = Buffer.from(envSecret);
  const b = Buffer.from(headerSecret);
  if (a.length !== b.length) return { ok: false, reason: 'bad-secret' };
  if (!crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'bad-secret' };

  const trainerId = (request.headers.get('X-Trainer-Id') ?? '').trim();
  if (!UUID_RE.test(trainerId)) return { ok: false, reason: 'bad-trainer-id' };

  return { ok: true, trainerId };
}
