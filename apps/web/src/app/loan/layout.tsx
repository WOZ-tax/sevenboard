import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "融資シミュレーション | SevenBoard",
};

export default function LoanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
