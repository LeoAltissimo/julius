import { BottomNav } from "@/components/bottom-nav";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The middleware already gates these routes; this is the second lock, so a
  // misconfigured matcher can never turn into a data leak.
  await requireUser();

  return (
    <div className="min-h-dvh bg-surface-1">
      {/*
        Installed on iOS the page runs edge to edge under a translucent status
        bar, so the first row of content lands beneath the notch or the Dynamic
        Island unless it is pushed down. Bottom padding clears the fixed tab bar
        plus the home indicator.
      */}
      <main className="safe-top mx-auto w-full max-w-lg px-4 pb-28">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
