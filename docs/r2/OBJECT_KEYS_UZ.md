# AZURA R2 Object Keys

## Tavsiya etilgan key format
- `covers/{manhwaId}/cover.webp`
- `chapters/{manhwaId}/{chapterId}/pages/{pageNo}.webp`
- `chapters/{manhwaId}/{chapterId}/chapter.pdf`
- `banners/{bannerId}/media.{ext}`
- `avatars/{uid}/avatar.{ext}`

## Metadata
Har media asset uchun D1 `media_assets` jadvalida quyidagilar saqlanadi:
- `id`
- `kind`
- `folder`
- `filename`
- `mime_type`
- `size_bytes`
- `r2_key`
- `poster_key`
