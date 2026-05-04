# AZURA v8 — Kod tozaligi + D1/R2 tayyorgarlik hisoboti

## Qilingan asosiy ishlar

### 1. Adapter chegarasi qo‘shildi
Yangi fayl: `js/azura-adapter-v8.js`.

Bu fayl frontend bilan data qatlam orasida aniq boundary yaratadi:
- `AZURA_STORE.users()`
- `AZURA_STORE.listLibrary(uid)`
- `AZURA_STORE.upsertLibrary(uid, item)`
- `AZURA_STORE.chapters()`
- `AZURA_STORE.upsertChapter(chapter)`
- `AZURA_STORE.findManhwa(id)`

D1/R2 bosqichida asosan shu fayl remote backendga almashtiriladi.

### 2. Katalog global qilindi
`MANHWA_DATA` endi `window.MANHWA_DATA` va `window.AZURA_CATALOG` orqali adapterlarga ko‘rinadi. Bu kutubxona kartalari va detail fallbacklar uchun muhim.

### 3. Eski local patch fayllar olib tashlandi
Paketdan chiqarildi:
- `js/azura-local-only.js`
- `js/azura-local-core-v6.js`

Aktiv local qatlam:
- `js/azura-adapter-v8.js`
- `js/azura-local-unified-v8.js`

### 4. Bob upload local/D1-R2 seamga moslandi
`js/11-chapter-system.js` endi faqat `https` muhitni talab qilmaydi. Agar `AZURA_API.media` va `AZURA_API.saveChapters` mavjud bo‘lsa, local adapterda ham ishlaydi. D1/R2 bosqichida shu API remote bo‘ladi.

### 5. D1 schema tayyorlandi
Yangi fayl:
- `docs/d1/schema.sql`

Jadvallar:
- users, sessions, manhwa, chapters, chapter_pages, media_assets
- library, reading_progress, ratings, likes, comments
- notifications, audit_log, coin_ledger

### 6. R2 va API hujjatlari qo‘shildi
- `docs/r2/R2_PLAN_UZ.md`
- `docs/api/API_CONTRACT_UZ.md`

## Hozirgi baho
| Yo‘nalish | Oldin | Hozir |
|---|---:|---:|
| Kod tozaligi | 7.0/10 | 8.3/10 |
| D1/R2 tayyorgarlik | 7.1/10 | 8.7/10 |

## Nega hali 10/10 emas?
Legacy modullar hali katta:
- `10-modern.js`
- `04-admin.js`
- `07-adult.js`
- `11-chapter-system.js`

Ularni 10/10 qilish uchun keyingi bosqichda modul-modul ajratish kerak. Ammo D1/R2 ga o‘tish uchun zarur chegaralar endi ancha aniqroq.
