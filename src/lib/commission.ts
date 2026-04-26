import { COMMISSION_FIRST_SALE, COMMISSION_REORDER } from '@/lib/constants';
import type { Order, Trainer } from '@/lib/types';

type CommissionInputOrder = Pick<Order, 'total'>;
type CommissionInputTrainer = Pick<Trainer, 'commission_rate' | 'reorder_commission_rate'>;

export function calculateCommission(
  order: CommissionInputOrder,
  trainer: CommissionInputTrainer,
  isFirstSale: boolean
) {
  const fallbackRate = isFirstSale ? COMMISSION_FIRST_SALE : COMMISSION_REORDER;
  const configuredRate = isFirstSale
    ? Number(trainer.commission_rate)
    : Number(trainer.reorder_commission_rate);
  const rate = Number.isFinite(configuredRate) && configuredRate > 0 ? configuredRate : fallbackRate;
  const total = Number(order.total);
  const normalizedTotal = Number.isFinite(total) ? total : 0;

  return {
    commissionType: isFirstSale ? 'first_sale' : 'reorder' as const,
    rate,
    amount: Number((normalizedTotal * rate).toFixed(2)),
  };
}
