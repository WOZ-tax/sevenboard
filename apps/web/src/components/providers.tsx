"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CurrentOrgProvider } from "@/contexts/current-org";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <CurrentOrgProvider>
        <TooltipProvider>{children}</TooltipProvider>
      </CurrentOrgProvider>
      <Toaster />
    </QueryClientProvider>
  );
}
