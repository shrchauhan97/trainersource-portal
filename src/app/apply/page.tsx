'use client';

import { useActionState } from 'react';
import { submitApplication } from './actions';
import { useFormStatus } from 'react-dom';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-[#FF5722] text-white font-semibold py-3 px-4 rounded-lg hover:bg-[#e64a19] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-inter"
    >
      {pending ? 'Submitting...' : 'Apply Now'}
    </button>
  );
}

type ApplyState = {
  success: boolean;
  error: string | null;
};

const initialState: ApplyState = {
  success: false,
  error: null,
};

export default function ApplyPage() {
  const [state, formAction] = useActionState(async (_prevState: ApplyState, formData: FormData) => {
    const result = await submitApplication(formData);
    return {
      success: !!result.success,
      error: result.error || null,
    };
  }, initialState);

  if (state.success) {
    return (
      <div className="min-h-screen bg-[#f4faff] flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm max-w-md w-full text-center">
          <div className="w-16 h-16 bg-[#2D4F67]/10 text-[#2D4F67] rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <title>Success</title>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-inter font-bold text-[#2D4F67] mb-2">Application Received!</h2>
          <p className="text-gray-600 font-plus-jakarta-sans">
            We&apos;ll review your application and get back to you shortly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4faff] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-inter font-bold text-[#2D4F67] mb-4">Join TrainerSource</h1>
          <p className="text-lg text-gray-600 font-plus-jakarta-sans">
            Apply to become a partner and start earning commissions.
          </p>
        </div>

        <div className="bg-white py-8 px-6 shadow-sm rounded-2xl sm:px-10">
          {state.error && (
            <div className="mb-6 bg-red-50 text-red-600 p-4 rounded-lg text-sm font-plus-jakarta-sans">
              {state.error}
            </div>
          )}

          <form action={formAction} className="space-y-6 font-plus-jakarta-sans">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Full Name *
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[#2D4F67] focus:outline-none focus:ring-1 focus:ring-[#2D4F67]"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email Address *
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[#2D4F67] focus:outline-none focus:ring-1 focus:ring-[#2D4F67]"
              />
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                Phone Number
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[#2D4F67] focus:outline-none focus:ring-1 focus:ring-[#2D4F67]"
              />
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="country" className="block text-sm font-medium text-gray-700">
                  Country *
                </label>
                <select
                  id="country"
                  name="country"
                  required
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[#2D4F67] focus:outline-none focus:ring-1 focus:ring-[#2D4F67]"
                >
                  <option value="">Select a country</option>
                  <option value="Singapore">Singapore</option>
                  <option value="UAE">UAE</option>
                  <option value="Japan">Japan</option>
                  <option value="USA">USA</option>
                  <option value="UK">UK</option>
                  <option value="Australia">Australia</option>
                </select>
              </div>

              <div>
                <label htmlFor="city" className="block text-sm font-medium text-gray-700">
                  City *
                </label>
                <input
                  id="city"
                  name="city"
                  type="text"
                  required
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[#2D4F67] focus:outline-none focus:ring-1 focus:ring-[#2D4F67]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="niche" className="block text-sm font-medium text-gray-700">
                Niche (Optional)
              </label>
              <input
                id="niche"
                name="niche"
                type="text"
                placeholder="e.g. CrossFit, Bodybuilding, Weight Loss"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[#2D4F67] focus:outline-none focus:ring-1 focus:ring-[#2D4F67]"
              />
            </div>

            <div>
              <label htmlFor="socialMedia" className="block text-sm font-medium text-gray-700">
                Social Media Handle/URL (Optional)
              </label>
              <input
                id="socialMedia"
                name="socialMedia"
                type="text"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[#2D4F67] focus:outline-none focus:ring-1 focus:ring-[#2D4F67]"
              />
            </div>

            <div>
              <label htmlFor="message" className="block text-sm font-medium text-gray-700">
                Why do you want to join? (Optional)
              </label>
              <textarea
                id="message"
                name="message"
                rows={4}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[#2D4F67] focus:outline-none focus:ring-1 focus:ring-[#2D4F67]"
              />
            </div>

            <SubmitButton />
          </form>
        </div>
      </div>
    </div>
  );
}
