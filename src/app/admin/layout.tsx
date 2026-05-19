import LoginForm from "./LoginForm";
import { getRole } from "@/lib/auth";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const role = getRole();
  if (!role) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <LoginForm />
      </main>
    );
  }
  return <>{children}</>;
}
