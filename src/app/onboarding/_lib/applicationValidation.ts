// Hard requirements before submitApplicationFinal can stamp
// application_submitted_at and advance the trainer to step 2. Without these
// a trainer could submit a blank application and only learn it's incomplete
// at /onboarding/go-live, after they've already gone through training.

import type { TrainerApplicationDetails } from './types';

const REQUIRED_FIELDS: ReadonlyArray<keyof TrainerApplicationDetails> = [
  'first_name',
  'last_name',
  'profession',
];

export type ApplicationCompletenessResult =
  | { ok: true }
  | { ok: false; missing: string[] };

// Pure function — easy to unit test. Trainer-level country/city live on the
// trainers row and are validated by checkApplicationReady at the action layer.
export function checkApplicationDetails(
  details: TrainerApplicationDetails | null,
): ApplicationCompletenessResult {
  if (!details) {
    return { ok: false, missing: [...REQUIRED_FIELDS] };
  }

  const missing: string[] = [];
  for (const key of REQUIRED_FIELDS) {
    const value = details[key];
    if (value === null || value === undefined) {
      missing.push(key);
      continue;
    }
    if (typeof value === 'string' && value.trim().length === 0) {
      missing.push(key);
    }
  }

  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

export const APPLICATION_REQUIRED_FIELDS = REQUIRED_FIELDS;
