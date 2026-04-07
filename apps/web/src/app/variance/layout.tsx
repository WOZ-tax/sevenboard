import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "予実分析 | SevenBoard",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
