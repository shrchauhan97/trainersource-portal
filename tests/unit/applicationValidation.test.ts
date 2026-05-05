import { describe, expect, it } from 'vitest';
import {
  APPLICATION_REQUIRED_FIELDS,
  checkApplicationDetails,
} from '@/app/onboarding/_lib/applicationValidation';
import type { TrainerApplicationDetails } from '@/app/onboarding/_lib/types';

function emptyDetails(overrides: Partial<TrainerApplicationDetails> = {}): TrainerApplicationDetails {
  const base: TrainerApplicationDetails = {
    trainer_id: 't',
    first_name: null,
    last_name: null,
    zip: null,
    profession: null,
    experience_years: null,
    specialty: null,
    years_in_current_city: null,
    instagram: null,
    facebook_or_other: null,
    tiktok: null,
    linkedin: null,
    client_base_per_month: null,
    sales_goal_per_month: null,
    heard_about_source: null,
    selfie_video_path: null,
    application_submitted_at: null,
    updated_at: '2026-05-05T00:00:00Z',
  };
  return { ...base, ...overrides };
}

describe('checkApplicationDetails', () => {
  it('flags every required field as missing when details are null', () => {
    const result = checkApplicationDetails(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toEqual([...APPLICATION_REQUIRED_FIELDS]);
    }
  });

  it('flags missing required fields (null)', () => {
    const result = checkApplicationDetails(emptyDetails());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toContain('first_name');
      expect(result.missing).toContain('last_name');
      expect(result.missing).toContain('profession');
    }
  });

  it('treats whitespace-only strings as missing', () => {
    const result = checkApplicationDetails(
      emptyDetails({
        first_name: '   ',
        last_name: 'Doe',
        profession: 'PT',
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toEqual(['first_name']);
    }
  });

  it('passes when every required field is present', () => {
    const result = checkApplicationDetails(
      emptyDetails({
        first_name: 'Tim',
        last_name: 'Smith',
        profession: 'Personal Trainer',
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('does not require optional fields like instagram or specialty', () => {
    // Sanity: even with required fields satisfied + optional fields blank, OK.
    const result = checkApplicationDetails(
      emptyDetails({
        first_name: 'Tim',
        last_name: 'Smith',
        profession: 'Personal Trainer',
        instagram: null,
        specialty: null,
      }),
    );
    expect(result.ok).toBe(true);
  });
});
