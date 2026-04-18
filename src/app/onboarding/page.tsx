import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { OnboardingContent } from './OnboardingContent';

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: trainer } = await supabase
    .from('trainers')
    .select('*')
    .eq('email', user.email)
    .single();

  if (!trainer) {
    redirect('/apply');
  }

  if (trainer.status === 'active') {
    redirect('/dashboard');
  }

  if (trainer.status !== 'onboarding') {
    return (
      <div className="min-h-screen bg-[#f4faff] flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm max-w-md w-full text-center">
          <h2 className="text-2xl font-inter font-bold text-[#2D4F67] mb-2">Application Pending</h2>
          <p className="text-gray-600 font-plus-jakarta-sans">
            Your application is currently being reviewed. We will notify you once you are approved for onboarding.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4faff] py-12 px-4 sm:px-6 lg:px-8 font-plus-jakarta-sans">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-inter font-bold text-[#2D4F67] mb-4">
            Welcome, {trainer.name}!
          </h1>
          <p className="text-lg text-gray-600">
            Please complete the following modules to activate your account.
          </p>
        </div>

        <OnboardingContent trainerId={trainer.id} />
      </div>
    </div>
  );
}
