import { LoginForm } from "./LoginForm";

type LoginPageProps = {
  searchParams?: {
    source?: string;
    ext_id?: string;
    dev_pair?: string;
    reason?: string;
  };
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <LoginForm
      source={searchParams?.source}
      extId={searchParams?.ext_id}
      devPair={searchParams?.dev_pair}
      reason={searchParams?.reason}
    />
  );
}
