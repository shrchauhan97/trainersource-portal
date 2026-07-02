type DebugPayload = {
  location: string;
  message: string;
  data?: Record<string, unknown>;
  hypothesisId?: string;
  runId?: string;
};

const SESSION_ID = '901d1f';
const INGEST =
  'http://127.0.0.1:7359/ingest/2dbdee18-b33b-41a0-823d-bd8e6a0d59a7';

export function linkTelegramDebug(payload: DebugPayload): void {
  const entry = {
    sessionId: SESSION_ID,
    timestamp: Date.now(),
    ...payload,
  };
  console.error('[link-telegram-debug]', JSON.stringify(entry));
  // #region agent log
  fetch(INGEST, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': SESSION_ID,
    },
    body: JSON.stringify(entry),
  }).catch(() => {});
  // #endregion
}

export function cookieNames(cookieHeader: string | null | undefined): string[] {
  if (!cookieHeader?.trim()) return [];
  return cookieHeader
    .split(';')
    .map((part) => part.trim().split('=')[0] ?? '')
    .filter(Boolean);
}

export function linkTelegramDebugEnabled(): boolean {
  return process.env.DEBUG_LINK_TELEGRAM === '1';
}
