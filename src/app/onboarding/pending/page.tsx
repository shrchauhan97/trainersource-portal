// Trainers whose status isn't 'onboarding' yet (still 'applied') land here
// instead of the stepper. Replaces the inline branch that used to live in
// the old onboarding/page.tsx.
export default function OnboardingPendingPage() {
  return (
    <div className="min-h-screen bg-[#f4faff] flex items-center justify-center p-4 font-plus-jakarta-sans">
      <div className="bg-white p-8 rounded-2xl shadow-sm max-w-md w-full text-center">
        <h2 className="text-2xl font-inter font-bold text-[#2D4F67] mb-2">Application Pending</h2>
        <p className="text-gray-600">
          Your application is currently being reviewed. We will notify you once you are approved
          for onboarding.
        </p>
      </div>
    </div>
  );
}
