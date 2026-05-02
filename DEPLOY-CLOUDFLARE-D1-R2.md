# AZURA3 Cloudflare Pages deploy

Bu versiyada `wrangler.toml` ichida D1 `database_id` yozilmagan. Shuning uchun GitHub deploy `Invalid database UUID` xatosiga tushmaydi.

## 1) Cloudflare Pages build settings

- Framework preset: `None`
- Build command: bo‘sh
- Output directory: `.`

## 2) D1 binding qo‘shish

Cloudflare Dashboard:

`Workers & Pages -> azura3 -> Settings -> Functions -> D1 database bindings`

Qo‘shing:

- Variable name: `DB`
- D1 database: `azura-db`

Agar `azura-db` hali bo‘lmasa, D1 SQL Database bo‘limidan yarating.

## 3) R2 binding qo‘shish

`Workers & Pages -> azura3 -> Settings -> Functions -> R2 bucket bindings`

Qo‘shing:

- Variable name: `MEDIA`
- Bucket: `azura-media`

## 4) Secretlar

`Workers & Pages -> azura3 -> Settings -> Environment variables`

Qo‘shing:

- `OWNER_PASSWORD` = owner parolingiz
- `ALLOWED_ORIGINS` = `https://sizning-domainingiz` yoki pages.dev domeningiz

## 5) D1 migration

Cloudflare D1 console orqali `migrations/0001_initial.sql` ichidagi SQL ni ishga tushiring.

Yoki lokal wrangler bilan ishlatsangiz:

```bash
npx wrangler d1 execute azura-db --file=./migrations/0001_initial.sql --remote
```

## 6) GitHub push

```bash
git add .
git commit -m "fix Cloudflare dashboard bindings deploy"
git push
```
