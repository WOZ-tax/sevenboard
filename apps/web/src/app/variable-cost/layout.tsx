import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "変動損益分析 | SevenBoard",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
