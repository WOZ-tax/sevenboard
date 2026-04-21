"use client";

import { useSyncExternalStore } from "react";

// 非表示にできないメニュー
const ALWAYS_VISIBLE = new Set(["/", "/settings"]);
const STORAGE_KEY = "sb_hidden_menus";

export { ALWAYS_VISIBLE };

const EMPTY_SNAPSHOT = "[]";
let clientSnapshot: string | null = null;

function readStorage(): string {
  if (typeof window === "undefined") return EMPTY_SNAPSHOT;
  return window.localStorage.getItem(STORAGE_KEY) ?? EMPTY_SNAPSHOT;
}

function getSnapshot(): string {
  if (clientSnapshot === null) clientSnapshot = readStorage();
  return clientSnapshot;
}

function getServerSnapshot(): string {
  return EMPTY_SNAPSHOT;
}

const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      clientSnapshot = readStorage();
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function notify() {
  for (const l of listeners) l();
}

function parse(json: string): Set<string> {
  try {
    return new Set(JSON.parse(json) as string[]);
  } catch {
    return new Set<string>();
  }
}

function write(next: Set<string>) {
  if (typeof window === "undefined") return;
  const json = JSON.stringify([...next]);
  window.localStorage.setItem(STORAGE_KEY, json);
  clientSnapshot = json;
  notify();
}

export function useSidebarConfig() {
  const json = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hiddenMenus = parse(json);
  return {
    isHidden: (href: string) =>
      !ALWAYS_VISIBLE.has(href) && hiddenMenus.has(href),
    toggle: (href: string) => {
      if (ALWAYS_VISIBLE.has(href)) return;
      const next = new Set(hiddenMenus);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      write(next);
    },
    setHidden: (href: string, hidden: boolean) => {
      if (ALWAYS_VISIBLE.has(href)) return;
      const next = new Set(hiddenMenus);
      if (hidden) next.add(href);
      else next.delete(href);
      write(next);
    },
  };
}
