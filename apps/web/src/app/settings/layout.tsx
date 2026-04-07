import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "設定 | SevenBoard",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <Suspense>{children}</Suspense>;
}
