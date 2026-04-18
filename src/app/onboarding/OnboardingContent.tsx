'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { completeOnboarding } from './actions';
import {
  ONBOARDING_CORRECT_ANSWERS,
  ONBOARDING_MODULES,
  ONBOARDING_QUESTIONS,
  type OnboardingQuizAnswers,
} from './constants';

type OnboardingContentProps = {
  trainerId: string;
};

type FeedbackState = {
  tone: 'success' | 'error';
  message: string;
} | null;

type QuizErrorState = Partial<Record<keyof OnboardingQuizAnswers, string>>;

const initialAnswers: OnboardingQuizAnswers = {
  q1: '',
  q2: '',
  q3: '',
};

const moduleVideoUrls = {
  'module-1': process.env.NEXT_PUBLIC_ONBOARDING_VIDEO_1,
  'module-2': process.env.NEXT_PUBLIC_ONBOARDING_VIDEO_2,
  'module-3': process.env.NEXT_PUBLIC_ONBOARDING_VIDEO_3,
} satisfies Record<(typeof ONBOARDING_MODULES)[number]['id'], string | undefined>;

function resolveEmbedUrl(url?: string) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, '');

    if (hostname === 'youtu.be') {
      const videoId = parsed.pathname.split('/').filter(Boolean)[0];
      return videoId ? `https://www.youtube.com/embed/${videoId}?rel=0` : null;
    }

    if (hostname.includes('youtube.com') || hostname.includes('youtube-nocookie.com')) {
      if (parsed.pathname.startsWith('/embed/')) {
        return url;
      }

      const videoId = parsed.searchParams.get('v') ?? parsed.pathname.split('/').filter(Boolean).at(-1);
      return videoId ? `https://www.youtube.com/embed/${videoId}?rel=0` : null;
    }

    if (hostname.includes('vimeo.com')) {
      if (hostname === 'player.vimeo.com') {
        return url;
      }

      const videoId = parsed.pathname.split('/').filter(Boolean).at(-1);
      return videoId ? `https://player.vimeo.com/video/${videoId}` : null;
    }

    return url;
  } catch {
    return null;
  }
}

function getQuizErrors(answers: OnboardingQuizAnswers): QuizErrorState {
  const errors: QuizErrorState = {};

  for (const question of ONBOARDING_QUESTIONS) {
    const answer = answers[question.key];

    if (!answer || answer !== ONBOARDING_CORRECT_ANSWERS[question.key]) {
      errors[question.key] = 'This answer is incorrect. Please review the module and try again.';
    }
  }

  return errors;
}

export function OnboardingContent({ trainerId }: OnboardingContentProps) {
  const router = useRouter();
  const [answers, setAnswers] = useState<OnboardingQuizAnswers>(initialAnswers);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [watchedVideos, setWatchedVideos] = useState<Record<string, boolean>>({});
  const [isPending, startTransition] = useTransition();

  const quizErrors = useMemo(() => getQuizErrors(answers), [answers]);
  const allAnswersCorrect = Object.keys(quizErrors).length === 0;

  const handleAnswerChange = (questionKey: keyof OnboardingQuizAnswers, value: string) => {
    const nextAnswers = {
      ...answers,
      [questionKey]: value,
    } satisfies OnboardingQuizAnswers;

    setAnswers(nextAnswers);

    if (hasAttemptedSubmit) {
      if (Object.keys(getQuizErrors(nextAnswers)).length === 0) {
        setFeedback(null);
      } else {
        setFeedback({
          tone: 'error',
          message: 'Some answers are incorrect. Please review.',
        });
      }
    }
  };

  const handleModuleStart = (moduleId: string) => {
    setWatchedVideos((current) => ({
      ...current,
      [moduleId]: true,
    }));
  };

  const handleComplete = () => {
    setHasAttemptedSubmit(true);

    if (!allAnswersCorrect) {
      setFeedback({
        tone: 'error',
        message: 'Some answers are incorrect. Please review.',
      });
      return;
    }

    setFeedback(null);

    startTransition(async () => {
      const result = await completeOnboarding(trainerId, answers);

      if (result?.error) {
        setFeedback({
          tone: 'error',
          message: result.error,
        });
        return;
      }

      router.push('/dashboard');
      router.refresh();
    });
  };

  return (
    <>
      <div className="space-y-8 mb-12">
        {ONBOARDING_MODULES.map((module) => {
          const embedUrl = resolveEmbedUrl(moduleVideoUrls[module.id]);
          const isWatched = watchedVideos[module.id] ?? false;

          return (
            <div key={module.id} className="bg-white p-6 rounded-2xl shadow-sm border border-[#2D4F67]/8">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-xl font-inter font-semibold text-[#2D4F67]">{module.title}</h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#2D4F67]/72">{module.description}</p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
                    isWatched
                      ? 'bg-[#FF5722]/10 text-[#FF5722]'
                      : 'bg-[#2D4F67]/8 text-[#2D4F67]/60'
                  }`}
                >
                  {isWatched ? 'Watched' : 'Not watched'}
                </span>
              </div>

              {embedUrl ? (
                <div className="relative overflow-hidden rounded-[1.25rem] border border-[#2D4F67]/10 bg-[#173041] aspect-video shadow-[0_18px_44px_rgba(23,48,65,0.16)]">
                  <iframe
                    src={embedUrl}
                    title={module.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    loading="lazy"
                    className="h-full w-full"
                  />
                  {!isWatched ? (
                    <button
                      type="button"
                      onClick={() => handleModuleStart(module.id)}
                      className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[linear-gradient(180deg,rgba(15,34,48,0.14),rgba(15,34,48,0.74))] p-6 text-center text-white transition hover:bg-[linear-gradient(180deg,rgba(15,34,48,0.10),rgba(15,34,48,0.66))]"
                    >
                      <span className="flex h-18 w-18 items-center justify-center rounded-full border border-white/25 bg-white/12 backdrop-blur-sm">
                        <svg className="h-8 w-8 translate-x-[2px]" fill="currentColor" viewBox="0 0 20 20">
                          <title>Start module</title>
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                        </svg>
                      </span>
                      <span className="space-y-1">
                        <span className="block font-inter text-lg font-semibold">Start module</span>
                        <span className="block text-sm text-white/78">
                          Click play to unlock the lesson and mark it as watched.
                        </span>
                      </span>
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="aspect-video rounded-[1.25rem] border border-dashed border-[#2D4F67]/16 bg-[#edf4f8] px-6 py-8 text-center text-[#2D4F67] shadow-inner">
                  <div className="mx-auto flex h-full max-w-sm flex-col items-center justify-center gap-4">
                    <span className="flex h-18 w-18 items-center justify-center rounded-full bg-white text-[#2D4F67]/48 shadow-sm">
                      <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 20 20">
                        <title>Video unavailable</title>
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 8a1 1 0 012 0v2a1 1 0 11-2 0V8zm2 6a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" />
                      </svg>
                    </span>
                    <div>
                      <p className="font-inter text-lg font-semibold text-[#2D4F67]">Video coming soon</p>
                      <p className="mt-2 text-sm leading-6 text-[#2D4F67]/68">
                        Add {module.envKey} to surface this training embed for trainers.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-white p-8 rounded-2xl shadow-sm mb-12 border border-[#2D4F67]/8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-2xl font-inter font-bold text-[#2D4F67]">Knowledge Check</h3>
            <p className="mt-2 text-sm leading-6 text-[#2D4F67]/72">
              Answer all three questions correctly to unlock account activation.
            </p>
          </div>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2D4F67]/56">
            {allAnswersCorrect ? 'Ready to complete' : 'Review required'}
          </span>
        </div>

        <div className="space-y-6">
          {ONBOARDING_QUESTIONS.map((question, index) => (
            <div key={question.key} className="rounded-[1.25rem] border border-[#2D4F67]/8 bg-[#f8fbfd] p-5">
              <p className="font-plus-jakarta-sans font-medium text-gray-900 mb-3">
                {index + 1}. {question.prompt}
              </p>
              <div className="space-y-2">
                {question.options.map((option) => {
                  const checked = answers[question.key] === option.value;

                  return (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-center space-x-3 rounded-xl border px-4 py-3 transition ${
                        checked
                          ? 'border-[#FF5722]/40 bg-[#FF5722]/6'
                          : 'border-transparent bg-white hover:border-[#2D4F67]/12 hover:bg-[#fcfdff]'
                      }`}
                    >
                      <input
                        type="radio"
                        name={question.key}
                        value={option.value}
                        checked={checked}
                        onChange={(event) => handleAnswerChange(question.key, event.target.value)}
                        className="h-4 w-4 text-[#FF5722] focus:ring-[#FF5722]"
                      />
                      <span className="text-gray-700">{option.label}</span>
                    </label>
                  );
                })}
              </div>
              {hasAttemptedSubmit && quizErrors[question.key] ? (
                <p className="mt-3 text-sm text-red-600">{quizErrors[question.key]}</p>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="text-center">
        {feedback ? (
          <div
            className={`mx-auto mb-5 max-w-xl rounded-2xl px-5 py-4 text-sm font-medium shadow-sm ${
              feedback.tone === 'error'
                ? 'bg-red-50 text-red-600'
                : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            {feedback.message}
          </div>
        ) : null}

        <button
          type="button"
          aria-disabled={!allAnswersCorrect || isPending}
          onClick={handleComplete}
          className={`font-inter text-lg font-semibold py-4 px-8 rounded-xl transition-colors shadow-md ${
            !allAnswersCorrect || isPending
              ? 'cursor-not-allowed bg-[#FF5722]/50 text-white'
              : 'bg-[#FF5722] text-white hover:bg-[#e64a19]'
          }`}
        >
          {isPending ? 'Completing...' : 'Complete Onboarding'}
        </button>
      </div>
    </>
  );
}
