import { redirect } from 'next/navigation';

import { getCurrentUser, getUserRole } from '@/lib/auth';

import SetPasswordForm from './set-password-form';

type SetPasswordPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function SetPasswordPage({ searchParams }: SetPasswordPageProps) {
  const user = await getCurrentUser();
  if (!user?.email) {
    redirect('/login');
  }

  const role = await getUserRole(user.email);
  if (role === 'suspended') redirect('/login?error=suspended');
  if (role !== 'admin' && role !== 'trainer') redirect('/login?error=not_authorized');

  const { next } = await searchParams;
  const safeNext = next && /^\/[A-Za-z0-9_\-/]*$/.test(next) ? next : role === 'admin' ? '/admin' : '/dashboard';

  return <SetPasswordForm email={user.email} next={safeNext} />;
}
