// src/app/api/trainer/codes/route.ts
import { NextResponse } from 'next/server';
import { requireBotSecret } from '@/lib/bot-auth';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

interface CodeRow {
  id: string;
  code: string;
  label: string | null;
  status: string;
  issued_via: string;
  created_at: string;
  expires_at: string;
}

export async function GET(request: Request) {
  const supabase = createServiceClient();
  const auth = await requireBotSecret(request, supabase);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  const { data: codes, error: codesError } = await supabase
    .from('access_codes')
    .select('id, code, label, status, issued_via, created_at, expires_at')
    .eq('trainer_id', auth.trainerId)
    .eq('issued_via', 'bot')
    .order('created_at', { ascending: false }) as unknown as {
      data: CodeRow[] | null;
      error: { message: string } | null;
    };

  if (codesError) return NextResponse.json({ error: codesError.message }, { status: 500 });

  // Count redemptions per code: join via customers.access_code_id
  const codeIds = (codes ?? []).map((c) => c.id);
  let usageByCode = new Map<string, number>();
  if (codeIds.length > 0) {
    const { data: custRows } = await supabase
      .from('customers')
      .select('access_code_id')
      .in('access_code_id', codeIds);
    for (const row of custRows ?? []) {
      const key = (row as { access_code_id: string }).access_code_id;
      usageByCode.set(key, (usageByCode.get(key) ?? 0) + 1);
    }
  }

  return NextResponse.json({
    codes: (codes ?? []).map((c) => ({
      id: c.id,
      code: c.code,
      label: c.label,
      status: c.status,
      created_at: c.created_at,
      expires_at: c.expires_at,
      redemption_count: usageByCode.get(c.id) ?? 0,
    })),
  });
}
