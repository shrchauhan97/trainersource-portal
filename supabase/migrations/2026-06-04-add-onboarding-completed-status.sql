-- Add the missing 'onboarding_completed' value to the trainer_status enum.
-- This status indicates a trainer has completed onboarding but is not yet active.
ALTER TYPE trainer_status ADD VALUE IF NOT EXISTS 'onboarding_completed' AFTER 'onboarding';