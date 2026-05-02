# AZURA V16 production stability fix

- `wrangler.toml` yo'q: Cloudflare dashboard bindings ishlaydi.
- D1 binding: `DB -> azura_db`.
- R2 binding: `MEDIA -> azura-media`.
- D1 users jadvali avval noto'g'ri yaratilgan bo'lsa, runtime avtomatik `uid TEXT PRIMARY KEY` formatiga ko'chiradi.
- Mobile bottom menu pastga `fixed` qilindi.
- Banner video ovozi default o'chiriladi; tugma bilan o'chirish/yoqish barqarorlashtirildi.
- Original dizayn saqlandi.
