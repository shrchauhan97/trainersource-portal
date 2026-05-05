'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { QUIZ_QUESTIONS } from './constants';
import { submitQuiz, type QuizAnswers } from './actions';

export type QuizTabProps = {
  // Disabled until all 5 modules have been watched.
  unlocked: boolean;
};

const initialAnswers: QuizAnswers = QUIZ_QUESTIONS.reduce<QuizAnswers>((acc, q) => {
  acc[q.key] = '';
  return acc;
}, {});

export function QuizTab({ unlocked }: QuizTabProps) {
  const router = useRouter();
  const [answers, setAnswers] = useState<QuizAnswers>(initialAnswers);
  const [results, setResults] = useState<Record<string, boolean> | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [allCorrect, setAllCorrect] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSelect = useCallback((key: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    // Reset feedback for the changed question so the user gets a clean retry.
    setResults((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setSubmissionError(null);
  }, []);

  const handleSubmit = useCallback(() => {
    setSubmissionError(null);

    // Require every question answered before hitting the server.
    const missing = QUIZ_QUESTIONS.find((q) => !answers[q.key]);
    if (missing) {
      setSubmissionError('Please answer every question before submitting.');
      return;
    }

    startTransition(async () => {
      const result = await submitQuiz(answers);

      if (result.error && !result.results) {
        setSubmissionError(result.error);
        return;
      }

      if (result.results) {
        setResults(result.results);
      }

      if (result.allCorrect) {
        setAllCorrect(true);
      }
    });
  }, [answers]);

  const handleNext = useCallback(() => {
    router.push('/onboarding/agreement');
    router.refresh();
  }, [router]);

  if (!unlocked) {
    return (
      <div className="rounded-[1rem] border border-dashed border-[#41627B]/30 bg-[#f4f9fc] px-6 py-12 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2D4F67]/56">Quiz locked</p>
        <h3 className="mt-3 text-xl font-black text-[#173041]">Watch all 5 videos to unlock</h3>
        <p className="mt-2 text-sm text-[#2D4F67]/72">
          Head back to the Videos tab and tap each lesson to mark it as watched.
        </p>
      </div>
    );
  }

  if (allCorrect) {
    // PDF screen 7 — full-bleed transition: italic center copy, no chrome,
    // no button. The stepper above already shows Agreement as unlocked
    // (advanceOnboardingStep moved trainer.onboarding_step to 'agreement'
    // on quiz pass) so the only forward affordance is clicking that tab.
    // We keep a subtle text link as a fallback for users who don't notice
    // the stepper highlight, but we don't render a primary CTA.
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-2xl font-medium italic leading-relaxed text-[#173041] sm:text-3xl">
          Thanks for going through the training.
        </p>
        <p className="mt-4 text-2xl font-medium italic leading-relaxed text-[#173041] sm:text-3xl">
          Now click on{' '}
          <button
            type="button"
            onClick={handleNext}
            className="underline decoration-[#FF5722] decoration-2 underline-offset-4 transition hover:text-[#FF5722]"
          >
            Agreement
          </button>
          . You&apos;re almost done!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h3 className="text-xl font-black uppercase tracking-[0.08em] text-[#173041]">Quiz</h3>
        <p className="mt-1 text-sm text-[#2D4F67]/72">
          Answer all 5 questions correctly to advance to the Agreement step.
        </p>
      </header>

      <div className="space-y-5">
        {QUIZ_QUESTIONS.map((question, index) => {
          const selected = answers[question.key];
          const correctness = results?.[question.key];
          const showError = correctness === false;

          return (
            <fieldset
              key={question.key}
              className={`rounded-[1rem] border bg-[#f8fbfd] p-5 transition ${
                showError ? 'border-red-300 bg-red-50/40' : 'border-[#41627B]/15'
              }`}
            >
              <legend className="px-2 text-xs font-bold uppercase tracking-[0.16em] text-[#2D4F67]/60">
                Question {index + 1}
              </legend>
              <p className="mt-1 font-semibold text-[#173041]">{question.prompt}</p>
              <div className="mt-3 space-y-2">
                {question.options.map((option) => {
                  const checked = selected === option.value;
                  return (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                        checked
                          ? 'border-[#FF5722]/40 bg-[#FF5722]/8 text-[#173041]'
                          : 'border-transparent bg-white text-[#173041]/85 hover:border-[#41627B]/15 hover:bg-[#fcfdff]'
                      }`}
                    >
                      <input
                        type="radio"
                        name={question.key}
                        value={option.value}
                        checked={checked}
                        onChange={(event) => handleSelect(question.key, event.target.value)}
                        className="mt-0.5 h-4 w-4 text-[#FF5722] focus:ring-[#FF5722]"
                      />
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </div>
              {showError ? (
                <p className="mt-3 text-sm text-red-600">
                  That&apos;s not quite right. Re-watch the lesson and try again.
                </p>
              ) : null}
            </fieldset>
          );
        })}
      </div>

      {submissionError ? (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {submissionError}
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="inline-flex items-center justify-center rounded-xl bg-[#FF5722] px-7 py-3 text-sm font-bold uppercase tracking-[0.14em] text-white shadow-md transition hover:bg-[#e64a19] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? 'Submitting…' : 'Submit answers'}
        </button>
      </div>
    </div>
  );
}
