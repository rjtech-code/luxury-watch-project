import { useCallback } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, del, get, hasSessionHint, patch, post, put, refreshSession, setSessionHint } from './api';
import { toast, useLists } from './store';

export const errMsg = (e) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

// ---------------------------------------------------------------- session
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      let r = await get('/api/auth/me');
      if (!r.user && hasSessionHint()) {
        if (await refreshSession()) r = await get('/api/auth/me');
        else setSessionHint(false);
      }
      return r.user ?? null;
    },
  });
}

export function useCan() {
  const { data: me } = useMe();
  return useCallback((...keys) => Boolean(me) && (me.role === 'SUPER_ADMIN' || keys.some((k) => me.permissions?.includes(k))), [me]);
}

export function useAuthActions() {
  const qc = useQueryClient();
  const afterLogin = async (user) => {
    setSessionHint(true);
    qc.setQueryData(['me'], user);
    // Carry a guest wishlist over to the account.
    const local = useLists.getState().wishlist;
    if (local.length) {
      await Promise.allSettled(local.map((slug) => put(`/api/account/wishlist/${slug}`)));
      useLists.getState().clearWishlistLocal();
    }
    qc.invalidateQueries({ queryKey: ['cart'] });
    qc.invalidateQueries({ queryKey: ['wishlist'] });
  };
  return {
    login: useMutation({ mutationFn: (b) => post('/api/auth/login', b), onSuccess: (r) => afterLogin(r.user) }),
    signup: useMutation({ mutationFn: (b) => post('/api/auth/signup', b), onSuccess: (r) => afterLogin(r.user) }),
    logout: useMutation({
      mutationFn: () => post('/api/auth/logout'),
      onSettled: () => {
        setSessionHint(false);
        qc.setQueryData(['me'], null);
        qc.removeQueries({ predicate: (q) => !['site', 'filters', 'products', 'home'].includes(q.queryKey[0]) });
        qc.invalidateQueries({ queryKey: ['cart'] });
      },
    }),
  };
}

// ---------------------------------------------------------------- site + catalogue
export const useSite = () => useQuery({ queryKey: ['site'], queryFn: () => get('/api/site'), staleTime: 5 * 60_000 });
export const useFilters = () => useQuery({ queryKey: ['filters'], queryFn: () => get('/api/catalog/filters'), staleTime: 60_000 });
export const useHome = () => useQuery({ queryKey: ['home'], queryFn: () => get('/api/catalog/home'), staleTime: 60_000 });
export const useProducts = (filters) =>
  useQuery({ queryKey: ['products', filters], queryFn: ({ signal }) => get('/api/catalog/products', filters, signal), placeholderData: keepPreviousData, staleTime: 30_000 });
export const useProduct = (slug) => useQuery({ queryKey: ['product', slug], queryFn: () => get(`/api/catalog/products/${slug}`), enabled: Boolean(slug), staleTime: 60_000, retry: (n, e) => e?.status !== 404 && n < 2 });
export const useBySlugs = (slugs) => useQuery({ queryKey: ['by-slugs', slugs], queryFn: () => get('/api/catalog/by-slugs', { slugs }), enabled: slugs.length > 0, staleTime: 30_000 });
export const useBrands = () => useQuery({ queryKey: ['brands'], queryFn: () => get('/api/catalog/brands'), staleTime: 5 * 60_000 });
export const useCollections = (brand) => useQuery({ queryKey: ['collections', brand ?? ''], queryFn: () => get('/api/catalog/collections', { brand }), staleTime: 5 * 60_000 });
export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: () => get('/api/catalog/categories'), staleTime: 5 * 60_000 });

// ---------------------------------------------------------------- cart
export const useCart = () => useQuery({ queryKey: ['cart'], queryFn: () => get('/api/cart'), select: (d) => d.cart, staleTime: 15_000 });

export function useCartActions() {
  const qc = useQueryClient();
  const set = (r) => r?.cart && qc.setQueryData(['cart'], { cart: r.cart });
  const fail = (e) => toast.error(errMsg(e));
  return {
    add: useMutation({ mutationFn: ({ variantId, quantity = 1 }) => post('/api/cart/items', { variantId, quantity }), onSuccess: set, onError: fail }),
    setQty: useMutation({ mutationFn: ({ variantId, quantity }) => patch(`/api/cart/items/${variantId}`, { quantity }), onSuccess: set, onError: fail }),
    remove: useMutation({ mutationFn: (variantId) => del(`/api/cart/items/${variantId}`), onSuccess: set, onError: fail }),
    applyCoupon: useMutation({ mutationFn: (code) => post('/api/cart/coupon', { code }), onSuccess: (r) => { set(r); toast.ok('Coupon applied.'); }, onError: fail }),
    removeCoupon: useMutation({ mutationFn: () => del('/api/cart/coupon'), onSuccess: set, onError: fail }),
  };
}

// ---------------------------------------------------------------- wishlist (server for members, browser for guests)
export function useWishlist() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const local = useLists((s) => s.wishlist);
  const toggleLocal = useLists((s) => s.toggleWishlistLocal);
  const server = useQuery({ queryKey: ['wishlist'], queryFn: () => get('/api/account/wishlist'), enabled: Boolean(me), select: (d) => d.slugs, staleTime: 30_000 });
  const slugs = me ? server.data ?? [] : local;

  const mutate = useMutation({
    mutationFn: ({ slug, on }) => (on ? put(`/api/account/wishlist/${slug}`) : del(`/api/account/wishlist/${slug}`)),
    onMutate: async ({ slug, on }) => {
      await qc.cancelQueries({ queryKey: ['wishlist'] });
      const prev = qc.getQueryData(['wishlist']);
      qc.setQueryData(['wishlist'], (d) => ({ slugs: on ? [slug, ...(d?.slugs ?? [])] : (d?.slugs ?? []).filter((x) => x !== slug) }));
      return { prev };
    },
    onError: (e, _v, ctx) => { qc.setQueryData(['wishlist'], ctx?.prev); toast.error(errMsg(e)); },
    onSettled: () => qc.invalidateQueries({ queryKey: ['wishlist'] }),
  });

  const has = (slug) => slugs.includes(slug);
  const toggle = (slug) => {
    const on = !has(slug);
    if (me) mutate.mutate({ slug, on });
    else toggleLocal(slug);
    toast.ok(on ? 'Saved to your wishlist.' : 'Removed from your wishlist.');
  };
  return { slugs, has, toggle, count: slugs.length };
}

export function useCompare() {
  const slugs = useLists((s) => s.compare);
  const toggleCompare = useLists((s) => s.toggleCompare);
  return {
    slugs,
    has: (slug) => slugs.includes(slug),
    toggle: (slug) => {
      const had = slugs.includes(slug);
      if (!toggleCompare(slug)) return toast.error('You can compare up to 4 watches. Remove one first.');
      toast.ok(had ? 'Removed from comparison.' : 'Added to comparison.');
    },
  };
}
