# AZURA V13 — original UI restored, deploy/performance stabilized

- Original visual layout preserved.
- Cloudflare D1 placeholder removed from wrangler config. Bind D1 in Pages dashboard as DB.
- R2 binding remains MEDIA -> azura-media.
- File-mode warning UI disabled.
- External PDF engine dependency removed; platform is image-first for manhwa, manga, komiks and lightweight novel reading.
- Added D1-first AZURA_STORE facade; legacy state calls route through this facade.
- Added image optimization helper: lazy/async/fetchpriority.
- CSS minified without changing selectors/classes.
- 0-byte cover files checked/fixed.
