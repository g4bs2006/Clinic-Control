import { AppNav } from "@/components/app-nav";
import { MobileTopBar } from "@/components/mobile-top-bar";
import { GlobalSearch } from "@/components/global-search";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { NotificationProvider } from "@/components/notifications/notification-context";
import { getSessionUser } from "@/lib/auth/session";
import { getCarteiraScope } from "@/lib/users/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, scope] = await Promise.all([getSessionUser(), getCarteiraScope()]);
  return (
    <ConfirmProvider>
      <NotificationProvider>
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
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileTopBar />
          <main className="flex-1">{children}</main>
        </div>
        <GlobalSearch />
      </div>
      </NotificationProvider>
    </ConfirmProvider>
  );
}
