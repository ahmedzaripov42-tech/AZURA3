(function(){
  'use strict';
  const loadedTemplates = new Map();
  const routeToPage = {
    detail:'page-detail', library:'page-library', coinshop:'page-coinshop', vip:'page-vip',
    notifications:'page-notifications', profile:'page-profile', admin:'page-admin', adult:'page-adult'
  };
  function fetchTemplate(url){
    if(loadedTemplates.has(url)) return loadedTemplates.get(url);
    const p = fetch(url, {cache:'force-cache'}).then(r=>{
      if(!r.ok) throw new Error('Template yuklanmadi: '+url);
      return r.text();
    });
    loadedTemplates.set(url,p);
    return p;
  }
  async function ensureTemplateFor(route){
    route = String(route || '');
    const id = routeToPage[route] || ('page-' + route);
    const el = document.getElementById(id);
    if(el && el.dataset && el.dataset.template && !el.dataset.loaded){
      const html = await fetchTemplate(el.dataset.template);
      el.outerHTML = html;
      const fresh = document.getElementById(id);
      if(fresh){ fresh.dataset.loaded = '1'; fresh.classList.remove('az-lazy-page'); }
      if(typeof window.AZURA_AFTER_TEMPLATE_LOAD === 'function') {
        try { window.AZURA_AFTER_TEMPLATE_LOAD(route); } catch(_) {}
      }
    }
    if(route === 'admin' || route === 'adult'){
      const mount = document.getElementById('azura-lazy-overlays');
      if(mount && mount.dataset && mount.dataset.template && !mount.dataset.loaded){
        mount.innerHTML = await fetchTemplate(mount.dataset.template);
        mount.dataset.loaded = '1';
      }
    }
  }
  window.AZURA_ENSURE_ROUTE_TEMPLATE = ensureTemplateFor;
  function installNavigateWrap(){
    if(typeof window.navigate !== 'function' || window.navigate.__azuraV8Wrapped) return false;
    const oldNavigate = window.navigate;
    function wrappedNavigate(name){
      const route = String(name || 'home');
      const needsTemplate = !!routeToPage[route];
      if(needsTemplate){
        ensureTemplateFor(route).then(function(){
          if((route === 'admin' || route === 'adult' || !/^(home|discover)$/.test(route)) && window.AZURA_LOAD_FULL_APP) window.AZURA_LOAD_FULL_APP('route:'+route);
          oldNavigate.apply(window, arguments);
        }.bind(this)).catch(function(err){
          console.warn('[AZURA] lazy route failed', err);
          oldNavigate.apply(window, arguments);
        }.bind(this));
        return;
      }
      if(!/^(home|discover)$/.test(route) && window.AZURA_LOAD_FULL_APP) window.AZURA_LOAD_FULL_APP('route:'+route);
      return oldNavigate.apply(this, arguments);
    }
    wrappedNavigate.__azuraV8Wrapped = true;
    window.navigate = wrappedNavigate;
    return true;
  }
  if(!installNavigateWrap()){
    document.addEventListener('DOMContentLoaded', installNavigateWrap, {once:true});
    setTimeout(installNavigateWrap, 300);
  }
})();
