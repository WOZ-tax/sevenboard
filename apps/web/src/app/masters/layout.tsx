import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "マスタ管理 | SevenBoard",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
