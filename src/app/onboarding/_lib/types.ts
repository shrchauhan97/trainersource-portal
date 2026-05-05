export type OnboardingStep = 'application' | 'training' | 'agreement' | 'go_live';

export const ONBOARDING_STEP_ORDER: readonly OnboardingStep[] = [
  'application',
  'training',
  'agreement',
  'go_live',
] as const;

export const ONBOARDING_STEP_PATHS: Record<OnboardingStep, string> = {
  application: '/onboarding/application',
  training: '/onboarding/training',
  agreement: '/onboarding/agreement',
  go_live: '/onboarding/go-live',
};

export const ONBOARDING_STEP_LABELS: Record<OnboardingStep, string> = {
  application: 'Application',
  training: 'Training',
  agreement: 'Agreement',
  go_live: 'Go Live',
};

export type TrainerApplicationDetails = {
  trainer_id: string;
  first_name: string | null;
  last_name: string | null;
  zip: string | null;
  profession: string | null;
  experience_years: number | null;
  specialty: string | null;
  years_in_current_city: number | null;
  instagram: string | null;
  facebook_or_other: string | null;
  tiktok: string | null;
  linkedin: string | null;
  client_base_per_month: number | null;
  sales_goal_per_month: number | null;
  heard_about_source: string | null;
  selfie_video_path: string | null;
  application_submitted_at: string | null;
  updated_at: string;
};

export type TrainerQualification = {
  id: string;
  trainer_id: string;
  certificate_name: string;
  issuing_body: string | null;
  date_of_issue: string | null;
  is_current: boolean;
  upload_path: string | null;
  created_at: string;
};

export type TrainerTrainingProgress = {
  trainer_id: string;
  module_id: TrainingModuleId;
  watched_at: string | null;
};

export type TrainingModuleId =
  | 'peptides_intro'
  | 'retatrutide'
  | 'copper'
  | 'purity'
  | 'never_selling';

export type TrainerPayoutDetails = {
  trainer_id: string;
  legal_first_name: string | null;
  legal_last_name: string | null;
  street1: string | null;
  street2: string | null;
  city: string | null;
  country: string | null;
  zip: string | null;
  bank_name: string | null;
  branch_code: string | null;
  account_number: string | null;
  swift_code: string | null;
  crypto_wallet_address: string | null;
  updated_at: string;
};

export type TrainerAgreement = {
  trainer_id: string;
  welcome_video_watched_at: string | null;
  signed_agreement_path: string | null;
  signed_at: string | null;
  updated_at: string;
};

export type TrainerOnboardingState = {
  trainerId: string;
  trainerName: string;
  trainerEmail: string;
  trainerCity: string | null;
  trainerCountry: string | null;
  status: 'applied' | 'onboarding' | 'active' | 'suspended';
  currentStep: OnboardingStep;
  application: TrainerApplicationDetails | null;
  qualifications: TrainerQualification[];
  trainingProgress: TrainerTrainingProgress[];
  payoutDetails: TrainerPayoutDetails | null;
  agreement: TrainerAgreement | null;
};
