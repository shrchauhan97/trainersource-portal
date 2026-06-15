import 'server-only';

import * as Sentry from '@sentry/nextjs';

import { onboardingCompleteAdminEmail, sendEmail } from '@/lib/email';
import { createServiceClient } from '@/lib/supabase/service';
import { downloadOnboardingFileWithService } from '../_lib/storage';

/** Pause execution for the given milliseconds. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Resend free tier = 2 req/s. Sequential sends with a 600ms gap keeps us
// under that ceiling. We also retry once on 429 (rate-limit) with a 1 s
// back-off so a transient burst from another route doesn't silently drop
// an email.
const SEND_GAP_MS = 600;
const RATE_LIMIT_RETRY_MS = 1000;

export async function notifyAdminsOfOnboardingCompletion(payload: {
  trainerId: string;
  trainerName: string;
  trainerEmail: string;
  city: string;
  signedAgreementPath: string;
}): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { data: admins, error } = await supabase.from('admins').select('email');
    if (error) {
      console.error('[go-live] could not load admin list', error);
      Sentry.captureMessage('go-live: admin list load failed', {
        level: 'error',
        extra: { trainerId: payload.trainerId, code: error.code, message: error.message },
      });
      return;
    }

    const recipients = (admins ?? [])
      .map((admin) => (admin.email as string | null)?.trim())
      .filter((email): email is string => Boolean(email));

    console.log('[go-live] admin recipients for onboarding completion:', recipients);

    if (!recipients.length) {
      console.warn('[go-live] no admins to notify of onboarding completion');
      return;
    }

    let agreementBuffer: Buffer | null = null;
    if (payload.signedAgreementPath) {
      agreementBuffer = await downloadOnboardingFileWithService(payload.signedAgreementPath);
      if (!agreementBuffer) {
        console.warn('[go-live] could not download signed agreement, sending email without attachment');
        Sentry.captureMessage('go-live: signed agreement download failed', {
          level: 'warning',
          extra: {
            trainerId: payload.trainerId,
            path: payload.signedAgreementPath,
          },
        });
      } else {
        console.log('[go-live] signed agreement downloaded successfully for attachment');
      }
    }

    const hasAttachment = agreementBuffer !== null;
    const { subject, html } = onboardingCompleteAdminEmail({
      ...payload,
      hasAttachment,
      signedAgreementPath: payload.signedAgreementPath || undefined,
    });
    console.log('[go-live] sending onboarding-complete email to', recipients.length, 'admin(s), subject:', subject);

    const attachments = agreementBuffer
      ? [{ filename: 'signed-agreement.pdf', content: agreementBuffer }]
      : undefined;

    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < recipients.length; i++) {
      const to = recipients[i];
      if (i > 0) await delay(SEND_GAP_MS);

      let result = await sendEmail({ to, subject, html, attachments });

      if (!result.ok && result.error?.includes('Too many requests')) {
        console.warn(`[go-live] rate-limited for ${to}, retrying in ${RATE_LIMIT_RETRY_MS}ms`);
        await delay(RATE_LIMIT_RETRY_MS);
        result = await sendEmail({ to, subject, html, attachments });
      }

      if (result.ok) {
        succeeded++;
        console.log(`[go-live] email sent to ${to}:`, result);
      } else {
        failed++;
        console.error(`[go-live] email FAILED to ${to}:`, result.error);
      }
    }

    if (failed > 0) {
      console.error('[go-live] admin notification partial failure', { succeeded, failed, total: recipients.length });
      Sentry.captureMessage('go-live: admin notification partial failure', {
        level: 'error',
        extra: { trainerId: payload.trainerId, succeeded, failed, total: recipients.length },
      });
    } else {
      console.info('[go-live] admin notification delivered to all', succeeded, 'admin(s)');
    }
  } catch (err) {
    console.error('[go-live] notifyAdminsOfOnboardingCompletion threw', err);
    Sentry.captureException(err, {
      extra: { trainerId: payload.trainerId },
    });
  }
}
