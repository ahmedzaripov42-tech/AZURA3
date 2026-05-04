# AZURA R2 Rejasi v8

## Bucket
- `azura-media`

## Object key standarti
- Cover: `covers/{manhwaId}/{assetId}.{ext}`
- Chapter page: `chapters/{manhwaId}/{chapterId}/page_0001.webp`
- PDF: `chapters/{manhwaId}/{chapterId}/source.pdf`
- Banner/video: `banners/{bannerId}/{assetId}.{ext}`

## D1 bilan bog‘lash
R2 fayl metadatasi D1 `media_assets` jadvalida turadi. UI hech qachon to‘g‘ridan-to‘g‘ri random R2 key yasamaydi; avval `/api/media` orqali asset yaratiladi, keyin `chapters.extra_json` yoki `chapter_pages.asset_id` bilan bog‘lanadi.

## Localdan R2 ga o‘tish
Hozir `js/azura-adapter-v8.js` local `DataURL` saqlaydi. D1/R2 bosqichida shu fayl remote adapterga almashtiriladi:
- `AZURA_STORE.upsertChapter()` → `/api/chapters`
- `AZURA_API.media()` → R2 upload endpoint
- `AZURA_STORE.listLibrary()` → D1 `library + reading_progress`

UI fayllarni o‘zgartirish shart bo‘lmasligi kerak.
