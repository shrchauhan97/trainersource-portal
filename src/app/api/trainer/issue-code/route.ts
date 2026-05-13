// src/app/api/trainer/issue-code/route.ts
import { NextResponse } from 'next/server';
import { requireBotSecret } from '@/lib/bot-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { issueTrainerCode, slugFromLabel } from '@/lib/issue-code';

export const runtime = 'nodejs';

// Re-export slugFromLabel for callers that imported it from this route.
export { slugFromLabel };

export async function POST(request: Request) {
  const supabase = createServiceClient();
  const auth = await requireBotSecret(request, supabase);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  let body: { label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 });
  }

  const outcome = await issueTrainerCode(supabase, auth.trainerId, body.label ?? '');

  if (!outcome.ok) {
    switch (outcome.error.kind) {
      case 'label-required':
        return NextResponse.json({ error: 'label-required' }, { status: 400 });
      case 'label-too-long':
        return NextResponse.json({ error: 'label-too-long' }, { status: 400 });
      case 'db-error':
        return NextResponse.json({ error: outcome.error.message }, { status: 500 });
      case 'uniqueness-exhausted':
        return NextResponse.json(
          { error: 'could-not-generate-unique-code' },
          { status: 500 },
        );
    }
  }

  return NextResponse.json(outcome.result);
}
