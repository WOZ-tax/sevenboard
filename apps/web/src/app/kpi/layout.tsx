import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "KPI | SevenBoard",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
