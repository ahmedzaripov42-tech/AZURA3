# AZURA Cloudflare Pages + D1 + R2 deploy

## 1) D1 database yaratish
```bash
npm install
npx wrangler d1 create azura-db
```
Chiqqan `database_id` qiymatini `wrangler.toml` ichidagi `YOUR_D1_DATABASE_ID` o‘rniga yozing.

## 2) R2 bucket yaratish
```bash
npx wrangler r2 bucket create azura-media
```

## 3) Owner parolni secret qilish
```bash
npx wrangler pages secret put OWNER_PASSWORD
```
Eski hardcoded parol koddan olib tashlangan. Owner login UID: `AZR-YJTF-QYGT`.

Ixtiyoriy, production domenlarni cheklash uchun:
```bash
npx wrangler pages secret put ALLOWED_ORIGINS
```
Qiymat namunasi: `https://azura.pages.dev,https://azura.uz`

## 4) D1 migration
```bash
npm run d1:migrate:remote
```

## 5) Deploy
```bash
npm run deploy
```

## Nimalar tuzatildi
- Cloudflare Pages Functions uchun D1 `DB` va R2 `MEDIA` bindinglari qo‘shildi.
- D1 schema migration faylga chiqarildi: `migrations/0001_initial.sql`.
- Owner parol frontend/backend kodidan olib tashlandi va `OWNER_PASSWORD` secretga o‘tkazildi.
- PDF.js olib tashlangan; platforma WebP/JPG image-first reader sifatida optimizatsiya qilingan.
- Rasmlar lazy loading/async decoding bilan optimizatsiya qilindi.
- WebP bor joydagi JPG dublikat coverlar deploydan olib tashlandi.
- `.git` tarixi final zipdan olib tashlandi.
- Static assetlar uchun cache headers qo‘shildi.
