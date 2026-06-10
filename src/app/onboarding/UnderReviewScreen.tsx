'use client';

export function UnderReviewScreen() {
  return (
    <div className="rounded-[1.75rem] border border-[#41627B]/15 bg-white px-6 py-12 text-[#173041] shadow-[0_24px_60px_rgba(45,79,103,0.10)] sm:px-12 sm:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
          <svg
            className="h-8 w-8 text-emerald-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
        </div>

        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#FF5722]">
          Onboarding Complete
        </p>

        <h2 className="mt-6 text-3xl font-black tracking-tight sm:text-4xl">
          Your application is under review
        </h2>

        <p className="mt-5 text-base leading-7 text-[#2D4F67]/80 sm:text-lg">
          You&apos;ve completed all onboarding steps. Our team is reviewing your
          application and you&apos;ll receive a confirmation email once
          you&apos;re approved and activated.
        </p>

        <p className="mt-4 text-sm leading-6 text-[#2D4F67]/60">
          This usually takes 1–2 business days. If you have questions in the
          meantime, reach out to our support team.
        </p>
      </div>
    </div>
  );
}