# AZURA — Cloudflare Pages + D1 + R2 Deploy

Bu loyiha **2 ta rejimda** ishlaydi:

1. **Local mode** — `node server.js` orqali, `localStorage` da ma'lumotlar
2. **Remote mode** — Cloudflare Pages + D1 (database) + R2 (media) bilan production

UI kodi har ikki rejimda ham bir xil — adapter qatlami (`js/azura-adapter-v9.js`) ma'lumotlar manbasini boshqaradi.

---

## 1. Local ishga tushirish

```bash
npm install
npm start
```

Brauzer: `http://localhost:4173`

Tekshiruv:
```bash
npm run validate
```

---

## 2. Cloudflare ga deploy (bir martalik sozlash)

### 2.1. Wrangler o'rnatish va login
```bash
npm i -g wrangler
wrangler login
```

### 2.2. D1 database yaratish
```bash
wrangler d1 create azura
```
Chiqqan `database_id` ni `wrangler.toml` da `REPLACE_WITH_D1_ID_AFTER_CREATE` joyiga qo'ying.

### 2.3. R2 bucket yaratish
```bash
wrangler r2 bucket create azura-media
```

### 2.4. Migrations + seed
```bash
npm run deploy:db
```
Bu quyidagilarni bajaradi:
- `001_base.sql` → users, library, reading_progress, chapters, media_assets
- `002_indexes.sql` → asosiy indexlar
- `003_full_schema.sql` → manhwa, sessions, ratings, likes, comments, notifications, audit_log, coin_ledger
- `004_full_indexes.sql` → qolgan indexlar
- `seed/manhwa.sql` → 80 ta katalog (avtomatik generate)

### 2.5. R2 ga assetlarni yuklash
```bash
npm run deploy:r2
```

### 2.6. Pages ga deploy
```bash
npm run deploy:pages
```

Yoki bir buyruq bilan hammasini:
```bash
npm run deploy
```

---

## 3. Local↔Remote rejimini almashtirish

URL parametri orqali:

```
https://azura.app/?mode=remote   ← Cloudflare backend
https://azura.app/?mode=local    ← localStorage
```

Yoki `<script>window.__AZURA_FORCE_REMOTE = true;</script>` orqali default ni o'zgartiring.

---

## 4. Performance natijalari

| Ko'rsatkich | v9 | v10/v11 |
|---|---|---|
| `assets/` jami | 12 MB | **6 MB** |
| Avatar | 1003 KB | 9 KB |
| Eng katta cover | 487 KB | 60 KB |
| Bo'sh fayllar | 3 ta buzilgan | 0 |
| Render-blocking fonts | yo'q | yo'q |
| Service Worker | yo'q | bor (offline) |
| Save-Data API | qisman | to'liq |
| Slow-2g aniqlash | yo'q | bor |
| D1/R2 tayyor | qisman | 100% |
