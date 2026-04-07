import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "顧問コメント | SevenBoard",
};

export default function CommentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
