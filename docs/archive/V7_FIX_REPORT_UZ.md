
# AZURA v7 Fix Report

## Asosiy tuzatishlar
- `azura-local-only.js` va `azura-local-core-v6.js` o'rniga bitta yuklanadigan adapter qo'yildi: `azura-local-unified-v7.js`
- kutubxona/o'qilgan statistikasi `azura_library`, `azura_library_UID`, `azura_feature_library_UID`, `currentUser.library`, `reading_progress`, `stage3 cache` dan yig'iladigan qilindi
- `renderLibrary()` override qilinib, real progress va oxirgi bob bilan chiqadigan bo'ldi
- admin users panelda har user uchun real `kutubxona / o'qilgan` ko'rsatkichlari qo'shildi
- desktop detail chapter grid va detail action/header joylashuvi qayta polish qilindi

## Texnik natija
- local patch konfliktlari kamaydi
- active local patch layer endi bitta script orqali ishlaydi
- desktop detail va library sahifalari ancha izchil ko'rinadi
