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
      {/* Bottom padding clears the fixed tab bar plus the home indicator. */}
      <main className="mx-auto w-full max-w-lg px-4 pb-28">{children}</main>
      <BottomNav />
    </div>
  );
}
