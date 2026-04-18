export type OnboardingQuizAnswers = {
  q1: string;
  q2: string;
  q3: string;
};

export const ONBOARDING_CORRECT_ANSWERS: OnboardingQuizAnswers = {
  q1: '20',
  q2: '7',
  q3: 'biweekly',
};

export const ONBOARDING_QUESTIONS = [
  {
    key: 'q1',
    prompt: 'What is the standard commission rate for first-time sales?',
    options: [
      { label: '10%', value: '10' },
      { label: '20%', value: '20' },
      { label: '30%', value: '30' },
    ],
  },
  {
    key: 'q2',
    prompt: 'How long are access codes valid before expiring?',
    options: [
      { label: '7 days', value: '7' },
      { label: '14 days', value: '14' },
      { label: '30 days', value: '30' },
    ],
  },
  {
    key: 'q3',
    prompt: 'How often are payouts processed?',
    options: [
      { label: 'Weekly', value: 'weekly' },
      { label: 'Bi-weekly', value: 'biweekly' },
      { label: 'Monthly', value: 'monthly' },
    ],
  },
] as const satisfies ReadonlyArray<{
  key: keyof OnboardingQuizAnswers;
  prompt: string;
  options: ReadonlyArray<{
    label: string;
    value: string;
  }>;
}>;

export const ONBOARDING_MODULES = [
  {
    id: 'module-1',
    title: 'Module 1: Introduction to TrainerSource',
    description: 'Get grounded in the partner experience, dashboard flow, and what success looks like from day one.',
    envKey: 'NEXT_PUBLIC_ONBOARDING_VIDEO_1',
  },
  {
    id: 'module-2',
    title: 'Module 2: How Commissions Work',
    description: 'Learn how first-sale and reorder commissions are tracked, credited, and surfaced inside your portal.',
    envKey: 'NEXT_PUBLIC_ONBOARDING_VIDEO_2',
  },
  {
    id: 'module-3',
    title: 'Module 3: Best Practices',
    description: 'Review the outreach habits and client care rituals that keep your TrainerSource pipeline healthy.',
    envKey: 'NEXT_PUBLIC_ONBOARDING_VIDEO_3',
  },
] as const;
