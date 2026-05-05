// One-off: insert a mock BC order + matching commission for the Test Buyer
// created during the /api/codes/validate demo. Lets the admin UI show a real
// commission → payout batch → mark sent flow without needing a live BigCommerce.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(resolve(here, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/i);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: customer } = await supabase
  .from('customers')
  .select('id, trainer_id')
  .eq('email', 'buyer@demo.test')
  .single();

if (!customer) {
  console.error('Test buyer not found — run the validate-code curl first.');
  process.exit(1);
}

const { data: trainer } = await supabase
  .from('trainers')
  .select('id, commission_rate, reorder_commission_rate')
  .eq('id', customer.trainer_id)
  .single();

const orderTotal = 247.50;
const { data: order, error: orderError } = await supabase
  .from('orders')
  .insert({
    bigcommerce_order_id: `demo-${Date.now()}`,
    customer_id: customer.id,
    trainer_id: customer.trainer_id,
    total: orderTotal,
    status: 'paid',
    payment_method: 'ACH via Paychron',
    country: 'Singapore',
    city: 'Singapore',
  })
  .select('id')
  .single();
if (orderError) throw orderError;

const rate = Number(trainer.commission_rate);
const amount = Number((orderTotal * rate).toFixed(2));
const { error: commissionError } = await supabase.from('commissions').insert({
  trainer_id: customer.trainer_id,
  order_id: order.id,
  commission_type: 'first_sale',
  rate_snapshot: rate,
  amount,
  status: 'pending',
});
if (commissionError) throw commissionError;

console.log(`Seeded: order ${order.id} ($${orderTotal}), commission ${amount} @ ${rate*100}% pending`);
