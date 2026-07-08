import { AppNav } from "@/components/app-nav";
import { GlobalSearch } from "@/components/global-search";
import { getSessionUser } from "@/lib/auth/session";
import { getCarteiraScope } from "@/lib/users/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, scope] = await Promise.all([getSessionUser(), getCarteiraScope()]);
  return (
    <div className="flex min-h-screen bg-background">
      <AppNav
        user={
          user
            ? { name: user.name || user.email, role: user.role }
            : null
        }
        carteira={
          user?.role === "gestor"
            ? { options: scope.developerOptions, selected: scope.developerFilter }
            : null
        }
      />
      <main className="flex-1">{children}</main>
      <GlobalSearch />
    </div>
  );
}
