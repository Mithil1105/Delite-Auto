-- Adds the 4 payment-funnel event names requested for this phase (#13):
-- payment_method_selected / payment_started / payment_success / payment_failed. Purchase remains
-- the authoritative conversion event (server-owned, unchanged) — these are funnel-visibility only.

alter table public.analytics_events drop constraint analytics_events_event_name_check;

alter table public.analytics_events add constraint analytics_events_event_name_check check (event_name in (
  'product_view', 'search_submitted', 'search_result_click', 'search_zero_results',
  'category_view', 'brand_view',
  'add_to_cart', 'remove_from_cart', 'cart_quantity_changed', 'cart_viewed',
  'wishlist_add', 'wishlist_remove',
  'checkout_started', 'checkout_step_viewed', 'checkout_completed', 'checkout_failed', 'purchase',
  'payment_method_selected', 'payment_started', 'payment_success', 'payment_failed',
  'recommendation_impression', 'recommendation_click', 'recommendation_add_to_cart',
  'navigation_click', 'promotion_impression', 'promotion_click',
  'contact_started', 'contact_submitted'));
