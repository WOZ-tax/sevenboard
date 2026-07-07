import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "借入金管理 | SevenBoard",
};

export default function LoansLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
