import { AppNav } from "@/components/app-nav";
import { GlobalSearch } from "@/components/global-search";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <AppNav />
      <main className="flex-1">{children}</main>
      <GlobalSearch />
    </div>
  );
}
