# FIX11 Deploy fix

Cloudflare deploy xatosi:

Error 8000022: Invalid database UUID (YOUR_D1_DATABASE_ID)

Tuzatildi:
- wrangler.toml ichidan invalid D1 placeholder olib tashlandi.
- D1 binding Cloudflare Dashboard orqali ulanadigan qilindi.

Cloudflare Pages settings:
- Functions > D1 bindings:
  - Variable name: DB
  - Database: azura-db
- Functions > R2 bindings:
  - Variable name: MEDIA
  - Bucket: azura-media

Muhim: GitHub repo ichidagi wrangler.toml yangilangan bo'lishi kerak. Cloudflare logda commit message FIX11 deploy fix chiqishi kerak.
