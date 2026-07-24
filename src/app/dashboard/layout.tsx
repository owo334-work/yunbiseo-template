"use client";

import { usePathname } from "next/navigation";

import { MobileSidebar, Sidebar } from "@/components/sidebar";
import { SessionGuard } from "@/components/session-guard";
import { BackButton } from "@/components/back-button";
import { NavHistoryRecorder } from "@/components/nav-history";
import { MaskingProvider } from "@/components/masking-provider";
import { MaskModeIndicator } from "@/components/mask-mode-indicator";
import { cn } from "@/lib/utils";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isFullWidth = pathname?.startsWith("/dashboard/office") ?? false;
  const isWideContent =
    (pathname?.startsWith("/dashboard/schedules") ?? false) ||
    (pathname?.startsWith("/dashboard/work-status") ?? false) ||
    (pathname?.startsWith("/dashboard/work-journal") ?? false) ||
    (pathname?.startsWith("/dashboard/workspace") ?? false);

  return (
    <MaskingProvider>
      <div className="flex h-screen overflow-hidden bg-[#fbfdfc]">
        <SessionGuard />
        <NavHistoryRecorder />
        <MaskModeIndicator />
        <Sidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <MobileSidebar />
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <BackButton />
            <main
              className={cn(
                "min-h-0 flex-1 overflow-x-hidden",
                isFullWidth ? "overflow-y-hidden" : "overflow-y-auto px-4 py-4 md:px-6 md:py-5"
              )}
            >
              <div
                className={cn(
                  "w-full",
                  isFullWidth ? "h-full" : isWideContent ? "" : "mx-auto max-w-7xl"
                )}
              >
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </MaskingProvider>
  );
}
