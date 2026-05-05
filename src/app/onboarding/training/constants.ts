import type { TrainingModuleId } from '../_lib/types';

// 5 video modules (PDF screen 5). Titles render uppercase; subtitle italic.
// Video URL is read at render time from `envKey`. If unset → "Video coming soon".
export type TrainingModule = {
  id: TrainingModuleId;
  title: string;
  subtitle: string;
  durationLabel: string;
  envKey: string;
};

export const TRAINING_MODULES: readonly TrainingModule[] = [
  {
    id: 'peptides_intro',
    title: 'PEPTIDES',
    subtitle: 'What they are, how they work',
    durationLabel: '10 mins',
    envKey: 'NEXT_PUBLIC_TRAINING_VIDEO_PEPTIDES_INTRO',
  },
  {
    id: 'retatrutide',
    title: 'RETATRUTIDE',
    subtitle: 'Effective, but with considerations',
    durationLabel: '10 mins',
    envKey: 'NEXT_PUBLIC_TRAINING_VIDEO_RETATRUTIDE',
  },
  {
    id: 'copper',
    title: 'COPPER PEPTIDES',
    subtitle: 'Skin, hair & collagen',
    durationLabel: '20 mins',
    envKey: 'NEXT_PUBLIC_TRAINING_VIDEO_COPPER',
  },
  {
    id: 'purity',
    title: 'THE PURITY',
    subtitle: 'How "research only" is judged',
    durationLabel: '8 mins',
    envKey: 'NEXT_PUBLIC_TRAINING_VIDEO_PURITY',
  },
  {
    id: 'never_selling',
    title: 'NEVER SELLING',
    subtitle: 'Affiliate best practices',
    durationLabel: '9 mins',
    envKey: 'NEXT_PUBLIC_TRAINING_VIDEO_NEVER_SELLING',
  },
] as const;

// Quiz: 5 questions. Each row in `trainer_quiz_attempts` is one submission.
export type QuizOption = { value: string; label: string };
export type QuizQuestion = {
  key: string;
  prompt: string;
  options: ReadonlyArray<QuizOption>;
  correct: string;
};

export const QUIZ_QUESTIONS: readonly QuizQuestion[] = [
  {
    key: 'peptides_what_are',
    prompt: 'Peptides are what?',
    options: [
      { value: 'short_chain_aminos', label: 'Short chain amino acids' },
      { value: 'steroids', label: 'Steroids' },
      { value: 'drugs', label: 'Drugs' },
    ],
    correct: 'short_chain_aminos',
  },
  {
    key: 'retatrutide_risks',
    prompt: "Retatrutide's biggest risks are…",
    options: [
      { value: 'heart_stress', label: 'Heart stress – it makes your heart beat roughly 10% faster.' },
      { value: 'too_expensive', label: 'Too expensive 🙂' },
      { value: 'gut_blockages', label: 'If people stop eating entirely, they can face blockages in their guts.' },
    ],
    correct: 'heart_stress',
  },
  {
    key: 'copper_peptides_collagen',
    prompt: 'COPPER PEPTIDES: True or false — they encourage the body to make more collagen?',
    options: [
      { value: 'true', label: 'True' },
      { value: 'false', label: 'False' },
    ],
    correct: 'true',
  },
  {
    key: 'research_only_cost',
    prompt: 'RESEARCH ONLY peptides are usually roughly…',
    options: [
      { value: '50pct', label: '50% the cost of a doctor-prescribed GLP-1, 2, or 3.' },
      { value: '30pct', label: '30% the cost of a doctor-prescribed GLP-1, 2, or 3.' },
      { value: 'free', label: 'Free if you know the right people.' },
    ],
    correct: '30pct',
  },
  {
    key: 'smart_affiliates',
    prompt: 'SMART AFFILIATES in grey-market verticals…',
    options: [
      {
        value: 'spam_socials',
        label:
          'POST offers on social media and try to get the most attention possible, hoping that strangers will contact them and order.',
      },
      { value: 'play_smart', label: 'Play it smart: only refer to those they work with or directly know.' },
    ],
    correct: 'play_smart',
  },
] as const;
