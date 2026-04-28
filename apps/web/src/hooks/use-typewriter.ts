"use client";

import { useEffect, useState } from "react";

/**
 * 文字列を1文字ずつ「タイプ」する演出フック。
 * AI レスポンスを「いま生成されてる風」に見せるために使う。
 *
 * @param text 表示したい完成形の文字列
 * @param options.speed 1秒あたりの文字数（default 60）
 * @param options.enabled false のときは即時に全文を返す
 */
export function useTypewriter(
  text: string,
  options?: { speed?: number; enabled?: boolean },
): { displayed: string; isComplete: boolean } {
  const speed = options?.speed ?? 60;
  const enabled = options?.enabled ?? true;
  const [displayed, setDisplayed] = useState("");
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setDisplayed(text);
      setIsComplete(true);
      return;
    }
    setDisplayed("");
    setIsComplete(false);
    if (!text) {
      setIsComplete(true);
      return;
    }

    let i = 0;
    const intervalMs = Math.max(8, Math.round(1000 / speed));
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        setIsComplete(true);
        clearInterval(id);
      }
    }, intervalMs);

    return () => clearInterval(id);
  }, [text, speed, enabled]);

  return { displayed, isComplete };
}
