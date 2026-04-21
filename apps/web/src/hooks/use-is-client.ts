"use client";

import { useSyncExternalStore } from "react";

function subscribe(): () => void {
  return () => {};
}

function getSnapshot(): boolean {
  return true;
}

function getServerSnapshot(): boolean {
  return false;
}

// SSR時はfalse、クライアント水和後はtrueを返す。
// Rechartsなどwindowを必要とするコンポーネントのレンダリングガードに使用する。
export function useIsClient(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
