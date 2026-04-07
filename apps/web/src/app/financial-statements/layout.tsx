import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "財務諸表 | SevenBoard",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
