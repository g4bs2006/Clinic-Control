import { LoginScreen } from "@/components/login/login-screen";

interface LoginPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error =
    params.error === "locked" ? "locked" : params.error === "1" ? "invalid" : null;

  return <LoginScreen error={error} />;
}
