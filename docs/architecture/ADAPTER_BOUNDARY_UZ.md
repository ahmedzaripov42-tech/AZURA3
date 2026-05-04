# AZURA Adapter Boundary v9

## Maqsad
UI kodni local storage yoki kelajakdagi D1/R2 backendga to‘g‘ridan-to‘g‘ri bog‘lamaslik.

## Asosiy qatlam
`js/azura-adapter-v9.js`

Bu qatlam 2 rejimni qo‘llab-quvvatlaydi:
- `local`
- `remote`

## Rejimni almashtirish
```js
window.AZURA_CONFIG = {
  dataMode: 'remote',
  apiBase: '/api'
};
```

## UI ishlatishi kerak bo‘lgan yuzalar
- `AZURA_DATA.users.*`
- `AZURA_DATA.library.*`
- `AZURA_DATA.progress.*`
- `AZURA_DATA.chapters.*`
- `AZURA_DATA.media.*`
- `AZURA_DATA.catalog.*`

## Eski UI uchun compatibility
- `window.AZURA_STORE`
- `window.AZURA_API`

## D1/R2 bosqichida almashtiriladigan joy
Asosan faqat:
- `js/azura-adapter-v9.js`

UI fayllarining katta qismini o‘zgartirmasdan qoldirish maqsad qilingan.
