!function(){"use strict";function refreshCurrent(){window.AZURA_DATA&&window.AZURA_DATA.users&&Promise.resolve(window.AZURA_DATA.users.current()).then(function(user){if(user){window.currentUser=user;try{currentUser=user}catch(_){}}}).catch(function(){})}function refreshUi(){try{"function"==typeof window.renderHomeQuickStats&&window.renderHomeQuickStats()}catch(_){}try{"library"===(window.currentPage||"")&&"function"==typeof window.renderLibrary&&window.renderLibrary()}catch(_){}try{"function"==typeof window.updateUI&&window.updateUI()}catch(_){}}function bind(){refreshCurrent(),["storage","focus","visibilitychange"].forEach(function(evt){window.addEventListener(evt,function(){setTimeout(function(){refreshCurrent(),refreshUi()},80)},{passive:!0})}),["addToLibrary","saveReadingProgress","openChapter"].forEach(function(name){if("function"==typeof window[name]&&!window[name].__azv9){var orig=window[name],wrapped=function(){var out=orig.apply(this,arguments);return Promise.resolve(out).finally(function(){setTimeout(refreshUi,120)}),out};wrapped.__azv9=!0,window[name]=wrapped}})}"loading"===document.readyState?document.addEventListener("DOMContentLoaded",bind,{once:!0}):bind()}()
// Remote mode init — load chapters + banners from D1 on page load
!function(){
  if(window.__AZURA_RUNTIME_MODE!=="remote")return;
  document.addEventListener("DOMContentLoaded",function(){
    setTimeout(function(){
      // Load chapters from D1 into localStorage
      if(window.AZURA_API&&window.AZURA_API.chapters){
        window.AZURA_API.chapters.list().then(function(chs){
          if(!Array.isArray(chs)||!chs.length)return;
          // Merge with local (keep local for now, D1 wins on conflicts)
          try{
            var local=JSON.parse(localStorage.getItem("azura_chapters_pending")||"[]");
            var localIds=new Set(local.map(function(c){return c.id;}));
            var merged=local.slice();
            chs.forEach(function(c){
              if(!localIds.has(c.id)){
                // Normalize D1 chapter to local format
                merged.push({
                  id:c.id,manhwaId:c.manhwaId||c.manhwa_id,
                  number:c.number||c.chapterNo||1,
                  title:c.title||"",
                  accessType:c.accessType||c.access||"free",
                  coinPrice:c.coinPrice||c.price||0,
                  vip:c.vip||c.vipOnly||false,
                  status:c.status||"published",
                  format:c.format||"webp",
                  pageCount:c.pageCount||0,
                  pdfId:c.pdfId||null,
                  updatedAt:c.updatedAt||Date.now()
                });
              }
            });
            if(merged.length>local.length){
              localStorage.setItem("azura_chapters_pending",JSON.stringify(merged));
              window.AZURA_D1_CHAPTERS=merged;
              window.dispatchEvent(new CustomEvent("azura:chapters-updated",{detail:{source:"d1"}}));
            }
          }catch(e){console.warn("[Bridge] Chapter merge failed:",e);}
        }).catch(function(e){console.warn("[Bridge] D1 chapters load failed:",e);});
      }
      // Load banners from D1
      if(window.AZURA_API&&window.AZURA_API.banners){
        window.AZURA_API.banners.list().then(function(bans){
          if(!Array.isArray(bans)||!bans.length)return;
          try{
            var BANNER_KEY="azura_banners_v4";
            var local=JSON.parse(localStorage.getItem(BANNER_KEY)||"[]");
            var localIds=new Set(local.map(function(b){return b.id;}));
            var merged=local.slice();
            bans.forEach(function(b){
              if(!localIds.has(b.id)){
                merged.push({
                  id:b.id,slot:b.slot||"home-hero",title:b.title||"",
                  link:b.link||"",mediaType:b.mediaType||"image",
                  media:b.media||"",poster:b.poster||"",active:b.active!==false
                });
              }
            });
            if(merged.length>local.length){
              localStorage.setItem(BANNER_KEY,JSON.stringify(merged));
              window.dispatchEvent(new CustomEvent("azura:banners-updated",{detail:{source:"d1"}}));
              if(typeof window.injectBannerSlots==="function")setTimeout(window.injectBannerSlots,200);
            }
          }catch(e){console.warn("[Bridge] Banner merge failed:",e);}
        }).catch(function(e){console.warn("[Bridge] D1 banners load failed:",e);});
      }
    },800);// Wait 800ms for adapter to initialize
  },{once:true});
}();
