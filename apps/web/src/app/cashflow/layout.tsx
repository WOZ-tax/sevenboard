import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "資金繰り | SevenBoard",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
