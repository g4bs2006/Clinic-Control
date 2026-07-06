import { AppNav } from "@/components/app-nav";
import { GlobalSearch } from "@/components/global-search";
import { getSessionUser } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <div className="flex min-h-screen bg-background">
      <AppNav
        user={
          user
            ? { name: user.name || user.email, role: user.role }
            : null
        }
      />
      <main className="flex-1">{children}</main>
      <GlobalSearch />
    </div>
  );
}
