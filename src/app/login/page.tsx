import type { Metadata } from 'next';
import LoginForm from './login-form';

// T4.2/T4.3 — Login is a transactional page; we want a recognizable browser
// title but mark it noindex (it's not useful to search engines and there's no
// reason for partners to share a deep link to the magic-link form).
export const metadata: Metadata = {
  title: 'Log in',
  description: 'Log in to TrainerSource.',
  robots: { index: false, follow: false },
};

type LoginPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;
  const errorKey = Array.isArray(error) ? error[0] : error;

  return <LoginForm errorKey={errorKey} />;
}
