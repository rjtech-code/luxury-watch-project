import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

const safeStorage = {
  getItem: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  setItem: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  removeItem: (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

const toggle = (list, v, max) => (list.includes(v) ? list.filter((x) => x !== v) : [v, ...list].slice(0, max));

/** Browser-side lists: guest wishlist, comparison, recently viewed, recent searches. */
export const useLists = create(
  persist(
    (set, get) => ({
      wishlist: [],
      compare: [],
      recent: [],
      searches: [],
      toggleWishlistLocal: (slug) => set((s) => ({ wishlist: toggle(s.wishlist, slug, 200) })),
      clearWishlistLocal: () => set({ wishlist: [] }),
      /** Returns false when the comparison is already full. */
      toggleCompare: (slug) => {
        const s = get();
        if (!s.compare.includes(slug) && s.compare.length >= 4) return false;
        set({ compare: toggle(s.compare, slug, 4) });
        return true;
      },
      clearCompare: () => set({ compare: [] }),
      pushRecent: (slug) => set((s) => ({ recent: [slug, ...s.recent.filter((x) => x !== slug)].slice(0, 12) })),
      pushSearch: (q) => set((s) => ({ searches: [q, ...s.searches.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6) })),
      clearSearches: () => set({ searches: [] }),
    }),
    { name: 'lw_lists', version: 1, storage: createJSONStorage(() => safeStorage) },
  ),
);

let toastId = 0;
export const useUi = create((set) => ({
  toasts: [],
  cartOpen: false,
  searchOpen: false,
  menuOpen: false,
  setCartOpen: (v) => set({ cartOpen: v }),
  setSearchOpen: (v) => set({ searchOpen: v }),
  setMenuOpen: (v) => set({ menuOpen: v }),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  pushToast: (message, kind = 'info') => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }].slice(-4) }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 6000 : 3800);
  },
}));

export const toast = {
  ok: (m) => useUi.getState().pushToast(m, 'ok'),
  error: (m) => useUi.getState().pushToast(m, 'error'),
  info: (m) => useUi.getState().pushToast(m, 'info'),
};
