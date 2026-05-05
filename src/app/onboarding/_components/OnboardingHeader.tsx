import { logout } from '@/app/dashboard/actions';
import type { TrainerOnboardingState } from '../_lib/types';

// The dark navy hero matches the existing dashboard header so an onboarding
// trainer sees a consistent surface across pre/post activation. Differs from
// DashboardShell only in that it has no nav tabs (other dashboard sections
// stay greyed out until status='active').
export function OnboardingHeader({ state }: { state: TrainerOnboardingState }) {
  return (
    <header className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#173041] px-6 py-6 text-white shadow-[0_30px_80px_rgba(15,34,48,0.34)] sm:px-8">
      <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,_rgba(255,87,34,0.22),_transparent_62%)]" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-3 rounded-full border border-white/12 bg-white/6 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/78">
            <span className="h-2 w-2 rounded-full bg-[#FF5722]" />
            Trainer dashboard
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{state.trainerName}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
              Monitor your code inventory, attributed clients, and commission flow from one clinical control room.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-white/80">
            <span className="rounded-full border border-[#FF5722]/30 bg-[#FF5722]/14 px-4 py-2 font-semibold uppercase tracking-[0.18em] text-[#ffd5c8]">
              {state.status}
            </span>
            <span>{state.trainerEmail}</span>
            {state.trainerCity || state.trainerCountry ? (
              <>
                <span className="text-white/35">•</span>
                <span>
                  {[state.trainerCity, state.trainerCountry].filter(Boolean).join(', ')}
                </span>
              </>
            ) : null}
          </div>
        </div>

        <form action={logout}>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white transition hover:bg-white/14"
          >
            Logout
          </button>
        </form>
      </div>
    </header>
  );
}
