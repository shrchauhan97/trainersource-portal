export type AdminRole = 'superadmin' | 'admin';
export type TrainerTier = 'trainer' | 'lead' | 'network_partner';
export type TrainerStatus = 'applied' | 'onboarding' | 'active' | 'suspended';
export type CodeType = 'trainer' | 'founder' | 'organic';
export type CodeStatus = 'active' | 'consumed' | 'expired';
export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered';
export type PayoutStatus = 'pending' | 'sent' | 'confirmed';
export type CommissionStatus = 'pending' | 'approved' | 'paid';
export type CommissionType = 'first_sale' | 'reorder';

export interface Admin {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  created_at: string;
}

export interface Trainer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  country: string;
  city: string;
  niche: string | null;
  social_media: string | null;
  slug: string | null;
  tier: TrainerTier;
  status: TrainerStatus;
  commission_rate: number;
  reorder_commission_rate: number;
  max_clients: number;
  wise_account: string | null;
  onboarding_completed_at: string | null;
  created_at: string;
}

export interface AccessCode {
  id: string;
  code: string;
  type: CodeType;
  trainer_id: string | null;
  status: CodeStatus;
  created_at: string;
  expires_at: string;
  consumed_by: string | null;
  consumed_at: string | null;
}

export interface Customer {
  id: string;
  bigcommerce_customer_id: string | null;
  email: string;
  name: string;
  phone: string | null;
  country: string;
  city: string;
  trainer_id: string | null;
  access_code_id: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  bigcommerce_order_id: string;
  customer_id: string;
  trainer_id: string | null;
  total: number;
  status: OrderStatus;
  payment_method: string;
  shipstation_id: string | null;
  country: string | null;
  city: string | null;
  placed_at: string;
  updated_at: string;
}

export interface Payout {
  id: string;
  trainer_id: string;
  total: number;
  wise_transfer_id: string | null;
  status: PayoutStatus;
  period_start: string;
  period_end: string;
  created_at: string;
}

export interface Commission {
  id: string;
  trainer_id: string;
  order_id: string;
  payout_id: string | null;
  commission_type: CommissionType;
  rate_snapshot: number;
  amount: number;
  status: CommissionStatus;
  created_at: string;
}
