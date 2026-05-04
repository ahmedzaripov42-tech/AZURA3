# AZURA API Contract v8

Bu kontrakt local adapter va keyingi Cloudflare D1/R2 backend o‘rtasidagi chegarani belgilaydi.

## Auth
- `GET /api/auth` → `{ ok, user }`
- `POST /api/auth` body `{ action:'login'|'register'|'logout', ... }`

## Users
- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users` body `{ uid, patch }`
- `DELETE /api/users?uid=...`

## Library / progress
- `GET /api/library?uid=...`
- `POST /api/library` body `{ uid, manhwaId, state, progress, lastChapterId }`
- `POST /api/progress` body `{ uid, manhwaId, chapterId, percent }`

## Content
- `GET /api/chapters?manhwaId=...`
- `POST /api/chapters` body `Chapter[]`
- `PATCH /api/chapters` body `Partial<Chapter> & { id }`
- `DELETE /api/chapters?id=...`

## Media
- `POST /api/media` multipart/form-data → R2 asset
- `GET /api/media` → assets list

## Rule
Frontend faqat `AZURA_STORE` yoki `AZURA_API` orqali ishlashi kerak. Raw localStorage faqat local adapter ichida qoladi.
