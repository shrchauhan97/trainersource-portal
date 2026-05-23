import type { Metadata } from 'next';
import { requireActiveTrainer } from '../actions';
import { SettingsForm } from './SettingsForm';

export const metadata: Metadata = { title: 'Settings' };

export default async function DashboardSettingsPage() {
  const { trainer } = await requireActiveTrainer();

  return (
    <div className="space-y-6">
      <section className="rounded-[1.75rem] border border-[#2D4F67]/10 bg-white p-6 shadow-sm sm:p-8">
        <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr] xl:items-start">
          <div className="rounded-[1.5rem] bg-[#f4faff] p-6">
            <p className="text-xs font-plus-jakarta-sans font-semibold uppercase tracking-[0.2em] text-[#2D4F67]/60">
              Settings
            </p>
            <h1 className="mt-3 font-inter text-3xl font-bold text-[#2D4F67]">Refine your trainer profile</h1>
            <p className="mt-3 font-plus-jakarta-sans text-sm leading-6 text-[#2D4F67]/72">
              Update the details your operations team uses for outreach, positioning, and payout handling.
            </p>

            <div className="mt-6 space-y-3 font-plus-jakarta-sans text-sm text-[#2D4F67]/78">
              <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2D4F67]/46">Trainer</p>
                <p className="mt-2 font-medium text-[#2D4F67]">{trainer.name}</p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2D4F67]/46">Account email</p>
                <p className="mt-2 font-medium text-[#2D4F67]">{trainer.email}</p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2D4F67]/46">Location</p>
                <p className="mt-2 font-medium text-[#2D4F67]">
                  {trainer.city}, {trainer.country}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-[#2D4F67]/8 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <h2 className="font-inter text-2xl font-bold text-[#2D4F67]">Profile details</h2>
              <p className="mt-2 font-plus-jakarta-sans text-sm leading-6 text-[#2D4F67]/70">
                These fields stay private to your internal partner record unless surfaced by future portal features.
              </p>
            </div>

            <SettingsForm
              initialValues={{
                phone: trainer.phone ?? '',
                social_media: trainer.social_media ?? '',
                niche: trainer.niche ?? '',
                wise_account: trainer.wise_account ?? '',
              }}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
