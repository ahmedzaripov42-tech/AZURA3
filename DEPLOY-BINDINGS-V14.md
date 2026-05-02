# V14 Deploy Bindings Fix

This version removes D1/R2 bindings from `wrangler.toml` so Cloudflare Pages allows adding them from the Dashboard.

Add in Cloudflare Pages:

- Settings → Bindings → + Add → D1 database
  - Variable name: `DB`
  - Database: `azura_db`

- Settings → Bindings → + Add → R2 bucket
  - Variable name: `MEDIA`
  - Bucket: `azura-media`

Then retry deployment.
