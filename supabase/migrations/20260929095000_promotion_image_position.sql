-- Per-device focal point/zoom for a promotion's image/mobile image — Hasto-parity image
-- positioning (Documentations MD/delite-admin-editor-parity.md). Stored as jsonb rather than
-- separate x/y/zoom columns since the shape is per-device
-- ({desktop?/tablet?/mobile?: {x,y,zoom}}) and only ever read/written as a whole object by the
-- admin editor and (optionally) the storefront — matches how every other flexible CMS field in
-- this project already lives in a jsonb column rather than being normalized into columns.

alter table public.cms_promotions add column image_position jsonb;
alter table public.cms_promotions add column mobile_image_position jsonb;
