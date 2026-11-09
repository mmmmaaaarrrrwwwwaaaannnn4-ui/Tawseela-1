import type { AdminCatalog, Booking, Brand, Category, Deal, Dish, IssueResult, LikeResult, Me, Order, Post, Promo, Review, StoreSettings } from '@fig/shared';

import { registerRemote, type Remote } from '@/store/app-store';

import { api, errorMessage } from './api';
import { catalogChanged } from './sync';

const enc = encodeURIComponent;

/** The store's server calls, over the Fig & Fennel API. */
export const remote: Remote = {
  validatePromo: (code) => api.post<{ code: string; pct: number }>('/v1/promos/validate', { code }),
  redeem: (id) => api.post<Me>(`/v1/me/rewards/${enc(id)}/redeem`),
  rate: (id, input) => api.post<Order>(`/v1/orders/${enc(id)}/rating`, input),
  reportIssue: (orderId, type, text) =>
    orderId ? api.post<IssueResult>(`/v1/orders/${enc(orderId)}/issues`, { type, text }) : api.post<IssueResult>('/v1/issues', { type, text, orderId: null }),
  book: (b) => api.post<Booking>('/v1/bookings', b),
  cancelBooking: (id) => api.post<Booking>(`/v1/bookings/${enc(id)}/cancel`),
  like: (postId) => api.post<LikeResult>(`/v1/posts/${enc(postId)}/like`),

  createDish: (d) => api.post<Dish>('/v1/admin/dishes', d),
  patchDish: (id, p) => api.patch<Dish>(`/v1/admin/dishes/${enc(id)}`, p),
  deleteDish: (id) => api.delete(`/v1/admin/dishes/${enc(id)}`),
  createCategory: (name) => api.post<Category>('/v1/admin/categories', { name }),
  patchCategory: (id, p) => api.patch<Category>(`/v1/admin/categories/${enc(id)}`, p),
  reorder: async (kind, ids) => {
    await api.put(`/v1/admin/${kind}/order`, { ids });
  },
  patchBrand: (id, p) => api.patch<Brand>(`/v1/admin/brands/${enc(id)}`, p),
  patchBanner: (id, p) => api.patch(`/v1/admin/banners/${enc(id)}`, p),
  patchSection: (k, p) => api.patch(`/v1/admin/sections/${enc(k)}`, p),
  patchDeal: (p) => api.patch<Deal>('/v1/admin/deal', p),
  patchStore: (p) => api.patch<StoreSettings>('/v1/admin/store', p),
  createPromo: (code, pct) => api.post<Promo>('/v1/admin/promos', { code, pct }),
  patchPromo: (code, on) => api.patch<Promo>(`/v1/admin/promos/${enc(code)}`, { on }),
  createPost: (p) => api.post<Post>('/v1/admin/posts', p),
  patchPost: (id, p) => api.patch<Post>(`/v1/admin/posts/${enc(id)}`, p),
  deletePost: (id) => api.delete(`/v1/admin/posts/${enc(id)}`),

  advanceOrder: (id) => api.post<Order>(`/v1/admin/orders/${enc(id)}/advance`, {}),
  cancelOrder: (id) => api.post<Order>(`/v1/admin/orders/${enc(id)}/cancel`, {}),
  fireTicket: (id) => api.post<Order>(`/v1/admin/orders/${enc(id)}/fire`),
  itemDone: (id, index, done) => api.post<Order>(`/v1/admin/orders/${enc(id)}/items/${index}/done`, { done }),
  setBookingStatus: (id, status) => api.patch<Booking>(`/v1/admin/bookings/${enc(id)}`, { status }),
  replyReview: (id) => api.post<Review>(`/v1/admin/reviews/${enc(id)}/reply`, {}),

  catalogChanged,
  errorMessage: (e) => errorMessage(e),
};

registerRemote(remote);

export type { AdminCatalog };
