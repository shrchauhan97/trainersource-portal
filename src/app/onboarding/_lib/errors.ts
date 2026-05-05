import 'server-only';

// Wraps a Supabase / unknown error so the message we surface to the client
// never leaks internal column names or stack traces. Logs the full error
// server-side for debugging.
export function safeError(prefix: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[${prefix}]`, message, err);
  return 'Something went wrong. Please try again, or contact support if it persists.';
}
