'use client';

import { useState } from 'react';
import { SubTabs } from '../_components/SubTabs';
import type { TrainerOnboardingState, TrainingModuleId } from '../_lib/types';
import { TRAINING_MODULES } from './constants';
import { VideosTab } from './videos-tab';
import { QuizTab } from './quiz-tab';

const TABS = [
  { key: 'videos', label: 'Videos' },
  { key: 'quiz', label: 'Quiz' },
] as const;

const ALL_MODULE_IDS: readonly TrainingModuleId[] = TRAINING_MODULES.map((m) => m.id);

export function TrainingScreen({ state }: { state: TrainerOnboardingState }) {
  // Hydrate watched-set from server state. Only timestamps that are non-null
  // count — a row with `watched_at = null` indicates "in progress" only.
  const initiallyWatched = new Set<TrainingModuleId>(
    state.trainingProgress
      .filter((p) => p.watched_at !== null)
      .map((p) => p.module_id),
  );

  const [watched, setWatched] = useState<Set<TrainingModuleId>>(initiallyWatched);

  const allWatched = ALL_MODULE_IDS.every((id) => watched.has(id));

  return (
    <div className="space-y-3">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#2D4F67]/56">Step 2 — Training</p>
        <h2 className="mt-1 text-2xl font-black tracking-tight text-[#173041]">Watch & quiz</h2>
      </header>
      <SubTabs tabs={[...TABS]}>
        {(active) =>
          active === 'videos' ? (
            <VideosTab initiallyWatched={initiallyWatched} onWatchedChange={setWatched} />
          ) : (
            <QuizTab unlocked={allWatched} />
          )
        }
      </SubTabs>
    </div>
  );
}
