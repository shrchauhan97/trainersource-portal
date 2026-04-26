import LoginForm from './login-form';

type LoginPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;
  const errorKey = Array.isArray(error) ? error[0] : error;

  return <LoginForm errorKey={errorKey} />;
}
