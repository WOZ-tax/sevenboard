import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "予算策定ヘルパー | SevenBoard",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
