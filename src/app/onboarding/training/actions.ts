'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { advanceOnboardingStep } from '../_lib/state';
import type { TrainingModuleId } from '../_lib/types';
import { QUIZ_QUESTIONS, TRAINING_MODULES } from './constants';

const VALID_MODULE_IDS = new Set<TrainingModuleId>(TRAINING_MODULES.map((m) => m.id));

// Resolves the trainer row for the signed-in user. Returns trainer_id when
// the user is in the `onboarding` state — otherwise returns an error string.
async function resolveOnboardingTrainer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: 'You must be signed in.' as const };
  }

  const { data: trainer } = await supabase
    .from('trainers')
    .select('id, status')
    .eq('email', user.email)
    .maybeSingle();

  if (!trainer) {
    return { error: 'Trainer not found.' as const };
  }

  if (trainer.status !== 'onboarding') {
    return { error: 'Onboarding is not active.' as const };
  }

  return { supabase, trainerId: trainer.id as string };
}

// Marks a single module as watched. Upserts (trainer_id, module_id) — first
// click wins, subsequent calls are no-ops via `ignoreDuplicates`.
export async function markWatched(
  moduleId: TrainingModuleId,
): Promise<{ error?: string; watched_at?: string }> {
  if (!VALID_MODULE_IDS.has(moduleId)) {
    return { error: 'Unknown module.' };
  }

  const session = await resolveOnboardingTrainer();
  if ('error' in session) return { error: session.error };
  const { supabase, trainerId } = session;

  const watchedAt = new Date().toISOString();

  // Upsert with ignoreDuplicates so we don't overwrite the original watched_at
  // timestamp on re-clicks. (Database PK is (trainer_id, module_id).)
  const { error } = await supabase
    .from('trainer_training_progress')
    .upsert(
      { trainer_id: trainerId, module_id: moduleId, watched_at: watchedAt },
      { onConflict: 'trainer_id,module_id', ignoreDuplicates: true },
    );

  if (error) {
    console.error('markWatched error', error);
    return { error: error.message };
  }

  revalidatePath('/onboarding/training');
  return { watched_at: watchedAt };
}

export type QuizAnswers = Record<string, string>;

export type SubmitQuizResult = {
  error?: string;
  // Per-question correctness map. Present even on errors that are caused by
  // wrong answers, so the client can render inline error messages.
  results?: Record<string, boolean>;
  allCorrect?: boolean;
  // Indicates the trainer was advanced past 'training' — client should redirect.
  advanced?: boolean;
};

// Records EVERY answer attempt (one row per question per submission) and
// reports per-question correctness. When all 5 are correct, advances the
// trainer to the 'agreement' step.
export async function submitQuiz(answers: QuizAnswers): Promise<SubmitQuizResult> {
  const session = await resolveOnboardingTrainer();
  if ('error' in session) return { error: session.error };
  const { supabase, trainerId } = session;

  // Build attempts + correctness map. We also accept missing answers — they
  // count as incorrect and are persisted as empty strings so the audit trail
  // is honest about what the user submitted.
  const results: Record<string, boolean> = {};
  const attempts = QUIZ_QUESTIONS.map((q) => {
    const submitted = (answers[q.key] ?? '').toString();
    const isCorrect = submitted === q.correct;
    results[q.key] = isCorrect;
    return {
      trainer_id: trainerId,
      question_key: q.key,
      answer: submitted,
      is_correct: isCorrect,
    };
  });

  const { error: insertError } = await supabase.from('trainer_quiz_attempts').insert(attempts);
  if (insertError) {
    console.error('submitQuiz insert error', insertError);
    return { error: insertError.message };
  }

  const allCorrect = attempts.every((a) => a.is_correct);

  if (!allCorrect) {
    return { results, allCorrect: false };
  }

  const advance = await advanceOnboardingStep(trainerId, 'agreement');
  if (advance.error) {
    return { error: advance.error, results, allCorrect: true };
  }

  revalidatePath('/onboarding/training');
  revalidatePath('/onboarding/agreement');
  revalidatePath('/onboarding');

  return { results, allCorrect: true, advanced: true };
}
