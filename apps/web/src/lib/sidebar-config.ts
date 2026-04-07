"use client";

import { create } from "zustand";

// 非表示にできないメニュー
const ALWAYS_VISIBLE = new Set(["/", "/settings"]);

interface SidebarConfigState {
  hiddenMenus: Set<string>; // hrefのSet
  isHidden: (href: string) => boolean;
  toggle: (href: string) => void;
  setHidden: (href: string, hidden: boolean) => void;
  hydrate: () => void;
}

export { ALWAYS_VISIBLE };

export const useSidebarConfig = create<SidebarConfigState>((set, get) => ({
  hiddenMenus: new Set<string>(),

  isHidden: (href: string) => {
    if (ALWAYS_VISIBLE.has(href)) return false;
    return get().hiddenMenus.has(href);
  },

  toggle: (href: string) => {
    if (ALWAYS_VISIBLE.has(href)) return;
    const current = get().hiddenMenus;
    const next = new Set(current);
    if (next.has(href)) {
      next.delete(href);
    } else {
      next.add(href);
    }
    set({ hiddenMenus: next });
    persist(next);
  },

  setHidden: (href: string, hidden: boolean) => {
    if (ALWAYS_VISIBLE.has(href)) return;
    const current = get().hiddenMenus;
    const next = new Set(current);
    if (hidden) {
      next.add(href);
    } else {
      next.delete(href);
    }
    set({ hiddenMenus: next });
    persist(next);
  },

  hydrate: () => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("sb_hidden_menus");
    if (stored) {
      try {
        const arr = JSON.parse(stored) as string[];
        set({ hiddenMenus: new Set(arr) });
      } catch {
        // ignore
      }
    }
  },
}));

function persist(hiddenMenus: Set<string>) {
  if (typeof window === "undefined") return;
  localStorage.setItem("sb_hidden_menus", JSON.stringify([...hiddenMenus]));
}
