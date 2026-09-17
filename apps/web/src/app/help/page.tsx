import type { Metadata } from "next";
import { HelpIndex } from "./_components";
export const metadata: Metadata = {
  title: "使い方・ヘルプ | SevenBoard",
  description:
    "SevenBoardのオンボーディングガイド。デモ画面で月次レビュー、財務指標、源泉集計、納税予想などの操作を確認できます。",
};
export default function HelpPage() {
  return <HelpIndex />;
}
