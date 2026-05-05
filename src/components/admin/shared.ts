import type {
  AccessCode,
  Admin,
  CodeStatus,
  CodeType,
  Commission,
  CommissionStatus,
  Order,
  OrderStatus,
  Payout,
  PayoutStatus,
  Trainer,
  TrainerStatus,
} from '@/lib/types';

export const adminNavigation = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/trainers', label: 'Trainers' },
  { href: '/admin/customers', label: 'Customers' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/commissions', label: 'Commissions' },
  { href: '/admin/payouts', label: 'Payouts' },
  { href: '/admin/codes', label: 'Codes' },
  { href: '/admin/events', label: 'Events' },
] as const;

type TrainerStats = {
  clientsCount: number;
  commissionEarned: number;
};

export type TrainerRow = Trainer & TrainerStats;

export type OrderRow = Order & {
  customerName: string;
  customerEmail: string;
  trainerName: string | null;
};

export type CommissionRow = Commission & {
  trainerName: string;
  orderReference: string;
};

export type PayoutRow = Payout & {
  trainerName: string;
};

export type CodeRow = AccessCode & {
  trainerName: string | null;
};

export type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  occurredAt: string;
  tone: 'slate' | 'orange';
};

export type DashboardData = {
  admin: Admin;
  trainerCounts: Record<TrainerStatus, number>;
  totalOrders: number;
  totalRevenue: number;
  pendingCommissions: number;
  recentActivity: ActivityItem[];
};

export type TrainerDetailData = {
  admin: Admin;
  trainer: Trainer;
  clientsCount: number;
  totalCommissionEarned: number;
  totalOrders: number;
  activeCodes: number;
  canDelete: boolean;
  recentOrders: OrderRow[];
  recentCommissions: CommissionRow[];
  recentCodes: CodeRow[];
  recentPayouts: PayoutRow[];
};

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function getSearchValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export const trainerStatusOptions: TrainerStatus[] = [
  'applied',
  'onboarding',
  'active',
  'suspended',
];

export const orderStatusOptions: OrderStatus[] = [
  'pending',
  'paid',
  'shipped',
  'delivered',
];

export const commissionStatusOptions: CommissionStatus[] = [
  'pending',
  'approved',
  'paid',
];

export const payoutStatusOptions: PayoutStatus[] = [
  'pending',
  'sent',
  'confirmed',
];

export const codeStatusOptions: CodeStatus[] = [
  'active',
  'consumed',
  'expired',
];

export const codeTypeOptions: CodeType[] = ['trainer', 'founder', 'organic'];
