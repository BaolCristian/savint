"use client";

import { SessionProvider } from "next-auth/react";
import { BASE_PATH } from "@/lib/base-path";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider basePath={`${BASE_PATH}/api/auth`}>{children}</SessionProvider>
  );
}
