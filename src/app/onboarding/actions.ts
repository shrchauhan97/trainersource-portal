'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { ONBOARDING_CORRECT_ANSWERS, type OnboardingQuizAnswers } from './constants';

function answersAreCorrect(answers: OnboardingQuizAnswers) {
  return Object.entries(ONBOARDING_CORRECT_ANSWERS).every(([key, value]) => {
    const answerKey = key as keyof OnboardingQuizAnswers;
    return answers[answerKey] === value;
  });
}

export async function completeOnboarding(trainerId: string, answers: OnboardingQuizAnswers) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: 'You must be signed in to complete onboarding.' };
  }

  if (!answersAreCorrect(answers)) {
    return { error: 'Some answers are incorrect. Please review.' };
  }

  const { data: trainer, error: trainerLookupError } = await supabase
    .from('trainers')
    .select('id, status')
    .eq('id', trainerId)
    .eq('email', user.email)
    .single();

  if (trainerLookupError || !trainer) {
    return { error: 'Unable to verify your onboarding session.' };
  }

  if (trainer.status !== 'onboarding') {
    return { error: 'Your onboarding status is no longer eligible for completion.' };
  }

  const { error } = await supabase
    .from('trainers')
    .update({
      status: 'active',
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', trainerId);

  if (error) {
    console.error('Error completing onboarding:', error);
    return { error: error.message };
  }

  revalidatePath('/onboarding');
  revalidatePath('/dashboard');

  return { success: true };
}
