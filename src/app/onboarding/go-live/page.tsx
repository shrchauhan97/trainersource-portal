import { loadTrainerOnboardingState } from '../_lib/state';

// Stub — Agent I replaces this with the go-live confirmation + activation action.
export default async function OnboardingGoLivePage() {
  await loadTrainerOnboardingState();
  return (
    <div className="rounded-[1.25rem] border border-[#41627B]/20 bg-white p-8 text-[#173041] shadow-[0_18px_44px_rgba(45,79,103,0.08)]">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#2D4F67]/56">Step 4 — Go Live</p>
      <h2 className="mt-3 text-2xl font-black tracking-tight">Coming soon</h2>
    </div>
  );
}
