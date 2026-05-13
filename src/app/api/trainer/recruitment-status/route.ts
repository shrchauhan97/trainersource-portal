import { NextResponse } from 'next/server';
import { requireBotSecret } from '@/lib/bot-auth';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const supabase = createServiceClient();
  const auth = await requireBotSecret(request, supabase);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  const threshold = Number(process.env.RECRUITMENT_THRESHOLD ?? 10);

  const { count, error } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('trainer_id', auth.trainerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const activeClients = count ?? 0;
  return NextResponse.json({
    unlocked: activeClients >= threshold,
    threshold,
    active_clients: activeClients,
  });
}
