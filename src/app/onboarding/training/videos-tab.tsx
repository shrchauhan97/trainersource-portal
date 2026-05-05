'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import type { TrainingModuleId } from '../_lib/types';
import { TRAINING_MODULES } from './constants';
import { markWatched } from './actions';

// Lifted directly from OnboardingContent.tsx — this normalises any
// YouTube/Vimeo URL into an embeddable iframe URL. Returns null when the
// caller passed a falsy or unrecognised string.
function resolveEmbedUrl(url?: string | null) {
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

// Env vars are read at module load time. NEXT_PUBLIC_* are inlined at build
// so this object is fully resolved on the client.
const MODULE_VIDEO_URLS: Record<TrainingModuleId, string | undefined> = {
  peptides_intro: process.env.NEXT_PUBLIC_TRAINING_VIDEO_PEPTIDES_INTRO,
  retatrutide: process.env.NEXT_PUBLIC_TRAINING_VIDEO_RETATRUTIDE,
  copper: process.env.NEXT_PUBLIC_TRAINING_VIDEO_COPPER,
  purity: process.env.NEXT_PUBLIC_TRAINING_VIDEO_PURITY,
  never_selling: process.env.NEXT_PUBLIC_TRAINING_VIDEO_NEVER_SELLING,
};

export type VideosTabProps = {
  initiallyWatched: Set<TrainingModuleId>;
  onWatchedChange?: (watched: Set<TrainingModuleId>) => void;
};

export function VideosTab({ initiallyWatched, onWatchedChange }: VideosTabProps) {
  const [watched, setWatched] = useState<Set<TrainingModuleId>>(() => new Set(initiallyWatched));
  const [activeModule, setActiveModule] = useState<TrainingModuleId | null>(null);
  const [isPending, startTransition] = useTransition();

  // Bubble watched-state up to the parent so the QUIZ tab can unlock.
  useEffect(() => {
    onWatchedChange?.(watched);
  }, [watched, onWatchedChange]);

  const activeModuleData = useMemo(
    () => TRAINING_MODULES.find((m) => m.id === activeModule) ?? null,
    [activeModule],
  );
  const activeEmbed = useMemo(
    () => resolveEmbedUrl(activeModuleData ? MODULE_VIDEO_URLS[activeModuleData.id] : undefined),
    [activeModuleData],
  );

  const handleOpen = useCallback(
    (moduleId: TrainingModuleId) => {
      setActiveModule(moduleId);

      // Optimistic — flip the local watched flag the moment they click.
      // Server action persists the timestamp; on failure we revert.
      const wasWatched = watched.has(moduleId);
      if (!wasWatched) {
        setWatched((prev) => {
          const next = new Set(prev);
          next.add(moduleId);
          return next;
        });

        startTransition(async () => {
          const result = await markWatched(moduleId);
          if (result.error) {
            // Revert on failure.
            setWatched((prev) => {
              const next = new Set(prev);
              next.delete(moduleId);
              return next;
            });
            console.error('Failed to mark module watched:', result.error);
          }
        });
      }
    },
    [watched],
  );

  const handleClose = useCallback(() => setActiveModule(null), []);

  // Close modal on Escape.
  useEffect(() => {
    if (!activeModule) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveModule(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeModule]);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {TRAINING_MODULES.map((module) => {
          const isWatched = watched.has(module.id);
          const url = MODULE_VIDEO_URLS[module.id];
          const hasVideo = Boolean(resolveEmbedUrl(url));

          return (
            <article
              key={module.id}
              className="flex flex-col overflow-hidden rounded-[1rem] border border-[#41627B]/20 bg-white shadow-[0_12px_28px_rgba(45,79,103,0.08)]"
            >
              <header className="bg-[#173041] px-4 py-5 text-white">
                <h3 className="text-sm font-black uppercase leading-tight tracking-[0.06em]">
                  {module.title}
                </h3>
                <p className="mt-1 text-xs italic leading-snug text-white/80">{module.subtitle}</p>
              </header>
              <div className="flex flex-1 flex-col items-center justify-center px-4 py-6">
                <p className="text-2xl font-black text-[#173041]">{module.durationLabel}</p>
                {isWatched ? (
                  <span className="mt-2 inline-flex items-center rounded-full bg-[#FF5722]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#FF5722]">
                    Watched
                  </span>
                ) : null}
              </div>
              <footer className="border-t border-[#41627B]/15 bg-[#f4f9fc]">
                <button
                  type="button"
                  onClick={() => handleOpen(module.id)}
                  className="flex w-full items-center justify-center gap-1 px-4 py-3 text-sm font-bold uppercase tracking-[0.12em] text-[#173041] transition hover:bg-[#bfe1fe]/50 disabled:opacity-50"
                  disabled={isPending && activeModule === module.id}
                >
                  {hasVideo ? 'Link' : 'Preview'}
                  <span aria-hidden="true">›</span>
                </button>
              </footer>
            </article>
          );
        })}
      </div>

      {activeModule && activeModuleData ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={activeModuleData.title}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
          onClick={handleClose}
        >
          <div
            className="relative w-full max-w-4xl overflow-hidden rounded-[1.25rem] bg-[#173041] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-6 py-4">
              <div>
                <h3 className="text-lg font-black uppercase tracking-[0.08em] text-white">
                  {activeModuleData.title}
                </h3>
                <p className="mt-0.5 text-sm italic text-white/70">{activeModuleData.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close video"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  ×
                </span>
              </button>
            </div>
            <div className="aspect-video w-full bg-black">
              {activeEmbed ? (
                <iframe
                  src={activeEmbed}
                  title={activeModuleData.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  loading="lazy"
                  className="h-full w-full"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center text-white/80">
                  <p className="text-lg font-semibold">Video coming soon</p>
                  <p className="text-sm text-white/60">
                    Set <code className="rounded bg-white/10 px-1.5 py-0.5">{activeModuleData.envKey}</code>{' '}
                    to publish this lesson.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
