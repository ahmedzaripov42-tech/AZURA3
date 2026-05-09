function getCSRFToken() {
  const el = document.querySelector('meta[name="csrf-token"]');
  return el ? el.content : '';
}

function showToast(text, type = 'info') {
  if (typeof window.showSiteToast === 'function') {
    window.showSiteToast(text, type, { duration: 3500, gravity: 'top', position: 'center' });
    return;
  }

  if (typeof Toastify === 'undefined') {
    alert(text);
    return;
  }
  Toastify({
    text,
    duration: 3500,
    close: true,
    gravity: 'top',
    position: 'center',
    style: {
      background: 'rgba(18, 27, 42, 0.96)',
      color: '#f8fafc',
      borderRadius: '14px',
      border: '1px solid rgba(168, 85, 247, 0.35)',
      boxShadow: '0 14px 34px rgba(0, 0, 0, 0.28)',
    }
  }).showToast();
}

function urlFromTemplate(tpl, id) {
  return tpl.replace('/0/', `/${id}/`);
}

function qs(selector, root=document) { return root.querySelector(selector); }
function qsa(selector, root=document) { return Array.from(root.querySelectorAll(selector)); }

function initMangaComments(root, options = {}) {
  root = root || document.getElementById('comments-root');
  if (!root) return;
  if (root.dataset.commentsBound === '1') {
    if (options.load && typeof root.__loadMangaCommentsFeed === 'function') {
      root.__loadMangaCommentsFeed(true);
    }
    return;
  }
  root.dataset.commentsBound = '1';

  const data = root.dataset;
  const feedUrl = data.feedUrl;
  const createUrl = data.createUrl;
  const moderateUrl = data.moderateUrl;
  const pendingUrl = data.pendingUrl;
  const reactTpl = data.reactUrlTemplate;
  const reportTpl = data.reportUrlTemplate;
  const repliesTpl = data.repliesUrlTemplate;
  const pinTpl = data.pinUrlTemplate;
  const editTpl = data.editUrlTemplate;
  const deleteTpl = data.deleteUrlTemplate;
  const approveTpl = data.approveUrlTemplate;
  const rejectTpl = data.rejectUrlTemplate;
  const isAuth = data.isAuth === '1';
  const canModerate = data.canModerate === '1';
  const currentUserId = data.currentUserId || '';
  const maxLen = parseInt(data.maxLength || '1000', 10);

  const feedWrap = document.getElementById('comments-feed-wrap');
  const commentForm = document.getElementById('comment-form');
  const pendingToggle = qs('.pending-toggle', root);
  const pendingList = qs('#pending-list', root);
  let pendingLoaded = false;

  const state = {
    mode: 'auto',
    filter: '',
    loading: false,
    loaded: false
  };

  function updateCounter(textarea, counterEl) {
    if (!textarea || !counterEl) return;
    counterEl.textContent = `${textarea.value.length}/${maxLen}`;
  }

  function applyPermissions(scope=document) {
    qsa('.comment-item', scope).forEach(el => {
      const ownerId = el.dataset.commentUserId;
      const parentId = el.dataset.parentId;
      const editableUntil = el.dataset.editableUntil ? Date.parse(el.dataset.editableUntil) : 0;
      const now = Date.now();

      const likeBtn = qs('.comment-like', el);
      const dislikeBtn = qs('.comment-dislike', el);
      const reportBtn = qs('.comment-report', el);
      const replyBtn = qs('.comment-reply-toggle', el);

      if (!isAuth) {
        [likeBtn, dislikeBtn, reportBtn, replyBtn].forEach(btn => {
          if (btn) {
            btn.disabled = true;
            btn.classList.add('opacity-50', 'pointer-events-none');
          }
        });
      }

      const editBtn = qs('.comment-edit', el);
      const deleteBtn = qs('.comment-delete', el);
      const pinBtn = qs('.comment-pin', el);
      const modBtn = qs('.comment-moderate', el);

      if (editBtn) {
        if (isAuth && ownerId === currentUserId && now <= editableUntil) {
          editBtn.classList.remove('hidden');
        }
      }
      if (deleteBtn) {
        if (isAuth && (ownerId === currentUserId || canModerate)) {
          deleteBtn.classList.remove('hidden');
        }
      }
      if (pinBtn && canModerate && !parentId) {
        pinBtn.classList.remove('hidden');
      }
      if (modBtn && canModerate && ownerId && ownerId !== currentUserId) {
        modBtn.classList.remove('hidden');
      }
    });
  }

  function applyExpandState(scope=document) {
    qsa('.comment-item', scope).forEach(el => {
      const id = el.dataset.commentId;
      const key = `ml_comment_expand_${id}`;
      const val = localStorage.getItem(key);
      const body = qs('.comment-body', el);
      const toggle = qs('.comment-expand', el);
      if (!body || !toggle) return;
      if (val === '1') {
        body.classList.remove('clamped');
        toggle.textContent = 'Yop';
      }
    });
  }

  async function loadFeed(reset=false) {
    if (state.loading) return;
    state.loaded = true;
    state.loading = true;
    if (reset) {
      feedWrap.innerHTML = '<div class="text-slate-400 text-sm">Yuklanmoqda...</div>';
    }
    const url = new URL(feedUrl, window.location.origin);
    url.searchParams.set('mode', state.mode);
    if (state.filter) url.searchParams.set('filter', state.filter);

    const res = await fetch(url.toString(), { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    const html = await res.text();
    feedWrap.innerHTML = html;
    applyPermissions(feedWrap);
    applyExpandState(feedWrap);
    bindCounters(feedWrap);
    state.loading = false;
  }
  root.__loadMangaCommentsFeed = loadFeed;

  async function loadMore(btn) {
    const cursor = btn.dataset.nextCursor;
    const url = new URL(feedUrl, window.location.origin);
    url.searchParams.set('mode', state.mode);
    if (state.filter) url.searchParams.set('filter', state.filter);
    if (cursor) url.searchParams.set('cursor', cursor);
    btn.disabled = true;
    btn.textContent = 'Yuklanmoqda...';
    const res = await fetch(url.toString(), { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    const html = await res.text();
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const newFeed = qs('#comments-feed', temp);
    const currentFeed = qs('#comments-feed', feedWrap);
    if (newFeed && currentFeed) {
      const newItems = qsa('.comment-item', newFeed);
      const list = qs('.comments-list', currentFeed) || currentFeed;
      newItems.forEach(it => list.appendChild(it));
      const newMore = qs('.comment-load-more', newFeed);
      if (newMore) {
        btn.dataset.nextCursor = newMore.dataset.nextCursor;
        btn.textContent = 'Yana ko‘rsat';
        btn.disabled = false;
      } else {
        btn.remove();
      }
      applyPermissions(currentFeed);
      applyExpandState(currentFeed);
      bindCounters(currentFeed);
    } else {
      btn.textContent = 'Yana ko‘rsat';
      btn.disabled = false;
    }
  }

  function findCommentElById(id, scope=document) {
    return qs(`.comment-item[data-comment-id="${id}"]`, scope);
  }

  function buildRepliesUrl(commentEl, cursor = '') {
    const id = commentEl.dataset.commentId;
    const depth = parseInt(commentEl.dataset.depth || '0', 10) || 0;
    const url = new URL(urlFromTemplate(repliesTpl, id), window.location.origin);
    url.searchParams.set('depth', depth);
    if (cursor) url.searchParams.set('cursor', cursor);
    return url;
  }

  function syncRepliesToggle(commentEl, repliesCount) {
    const container = qs('.comment-replies', commentEl);
    if (!container) return;

    let toggle = qs('.comment-replies-toggle', commentEl);
    const count = Math.max(parseInt(repliesCount || '0', 10) || 0, 0);

    if (count <= 0) {
      if (toggle) toggle.remove();
      container.innerHTML = '';
      container.dataset.loaded = '0';
      container.classList.add('hidden');
      return;
    }

    const text = `Javoblarni o'qish (${count})`;
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.className = 'comment-replies-toggle mt-3 text-xs text-purple-300';
      container.insertAdjacentElement('beforebegin', toggle);
    }
    toggle.dataset.repliesCount = String(count);
    toggle.textContent = text;
  }

  async function loadRepliesForComment(commentEl, { cursor = '', append = false, force = false, keepOpen = true } = {}) {
    const container = qs('.comment-replies', commentEl);
    if (!container) return;

    if (!force && !cursor && !container.classList.contains('hidden') && container.dataset.loaded === '1') {
      container.classList.toggle('hidden');
      return;
    }

    const url = buildRepliesUrl(commentEl, cursor);
    const res = await fetch(url.toString(), { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    const html = await res.text();

    if (!append) {
      container.innerHTML = html;
      container.dataset.loaded = '1';
      if (keepOpen) {
        container.classList.remove('hidden');
      }
    } else {
      const temp = document.createElement('div');
      temp.innerHTML = html;
      const newItems = qsa('.comment-item', temp);
      const repliesList = qs('.replies-list', commentEl);
      if (repliesList) {
        newItems.forEach(it => repliesList.appendChild(it));
      }
      const currentMore = qs('.comment-replies-more', container);
      const newMore = qs('.comment-replies-more', temp);
      if (newMore && currentMore) {
        currentMore.dataset.nextCursor = newMore.dataset.nextCursor;
        currentMore.disabled = false;
        currentMore.textContent = 'Yana ko‘rsat';
      } else if (currentMore) {
        currentMore.remove();
      }
    }

    applyPermissions(container);
    applyExpandState(container);
    bindCounters(container);
  }

  async function refreshCommentBranch(commentEl) {
    await loadRepliesForComment(commentEl, { force: true, keepOpen: true });
  }

  async function refreshCommentPlacement(commentEl) {
    const parentId = commentEl.dataset.parentId;
    if (!parentId) {
      await loadFeed(true);
      return;
    }

    const parentEl = findCommentElById(parentId, root);
    if (!parentEl) {
      await loadFeed(true);
      return;
    }

    await refreshCommentBranch(parentEl);
  }

  function bindCounters(scope=document) {
    qsa('textarea', scope).forEach(textarea => {
      const counter = textarea.closest('form')?.querySelector('.comment-counter, .comment-reply-counter, .comment-edit-counter');
      if (counter) updateCounter(textarea, counter);
      textarea.addEventListener('input', () => updateCounter(textarea, counter));
    });
  }

  function setReplyFormTarget(form, username='') {
    if (!form) return;
    const textarea = qs('textarea', form);
    const cleanUsername = (username || '').trim();

    if (textarea) {
      textarea.placeholder = cleanUsername ? `@${cleanUsername} ga javob yozing...` : 'Javob yozing...';
    }
  }

  function closeReplyForm(form, { reset = false } = {}) {
    if (!form) return;
    if (reset) {
      form.reset();
      const counter = qs('.comment-reply-counter', form);
      if (counter) counter.textContent = `0/${maxLen}`;
    }
    setReplyFormTarget(form);
    form.classList.add('hidden');
  }

  function closeOtherReplyForms(activeForm) {
    qsa('.comment-reply-form', root).forEach(form => {
      if (form !== activeForm) {
        closeReplyForm(form, { reset: true });
      }
    });
  }

  async function postForm(url, formData) {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRFToken': getCSRFToken(), 'X-Requested-With': 'XMLHttpRequest' },
      body: formData
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      const msg = data.error || 'Xatolik yuz berdi.';
      showToast(msg, 'error');
      return { ok: false, data };
    }
    return { ok: true, data };
  }

  function init() {
    bindCounters(root);
    applyPermissions(root);

    const tabBtn = document.querySelector('[data-comments-tab]');
    if (tabBtn) {
      tabBtn.addEventListener('click', () => {
        if (!state.loaded) loadFeed(true);
      });
    }
    const params = new URLSearchParams(location.search);
    if (options.load || params.get('tab') === 'comments') {
      loadFeed(true);
    }
  }

  root.addEventListener('click', async (e) => {
    const modeBtn = e.target.closest('.comment-mode-btn');
    if (modeBtn) {
      state.mode = modeBtn.dataset.mode || 'new';
      await loadFeed(true);
      return;
    }

    const loadMoreBtn = e.target.closest('.comment-load-more');
    if (loadMoreBtn) {
      await loadMore(loadMoreBtn);
      return;
    }

    const repliesToggle = e.target.closest('.comment-replies-toggle');
    if (repliesToggle) {
      const commentEl = repliesToggle.closest('.comment-item');
      await loadRepliesForComment(commentEl);
      return;
    }

    const repliesMore = e.target.closest('.comment-replies-more');
    if (repliesMore) {
      const commentEl = repliesMore.closest('.comment-item');
      repliesMore.disabled = true;
      repliesMore.textContent = 'Yuklanmoqda...';
      await loadRepliesForComment(commentEl, {
        cursor: repliesMore.dataset.nextCursor || '',
        append: true,
        force: true,
        keepOpen: true
      });
      return;
    }

    const expandBtn = e.target.closest('.comment-expand');
    if (expandBtn) {
      const commentEl = expandBtn.closest('.comment-item');
      const body = qs('.comment-body', commentEl);
      if (!body) return;
      const id = commentEl.dataset.commentId;
      const key = `ml_comment_expand_${id}`;
      if (body.classList.contains('clamped')) {
        body.classList.remove('clamped');
        expandBtn.textContent = 'Yop';
        localStorage.setItem(key, '1');
      } else {
        body.classList.add('clamped');
        expandBtn.textContent = 'Hammasini ko‘rsat';
        localStorage.setItem(key, '0');
      }
      return;
    }

    const replyToggle = e.target.closest('.comment-reply-toggle');
    if (replyToggle) {
      if (!isAuth) {
        showToast('Izoh yozish uchun tizimga kiring.', 'error');
        return;
      }
      const commentEl = replyToggle.closest('.comment-item');
      const form = qs('.comment-reply-form', commentEl);
      if (!form) return;
      if (!form.classList.contains('hidden')) {
        closeReplyForm(form, { reset: true });
        return;
      }
      closeOtherReplyForms(form);
      setReplyFormTarget(form, commentEl.dataset.commentUsername || '');
      form.classList.remove('hidden');
      const textarea = qs('textarea', form);
      if (textarea) textarea.focus();
      const counter = qs('.comment-reply-counter', form);
      updateCounter(textarea, counter);
      return;
    }

    const replyCancel = e.target.closest('.comment-reply-cancel');
    if (replyCancel) {
      const form = replyCancel.closest('.comment-reply-form');
      closeReplyForm(form, { reset: true });
      return;
    }

    const reportBtn = e.target.closest('.comment-report');
    if (reportBtn) {
      if (!isAuth) {
        showToast('Shikoyat uchun tizimga kiring.', 'error');
        return;
      }
      const commentEl = reportBtn.closest('.comment-item');
      const reason = prompt('Shikoyat sababi (ixtiyoriy):') || '';
      const url = urlFromTemplate(reportTpl, commentEl.dataset.commentId);
      const fd = new FormData();
      fd.append('reason', reason);
      const res = await postForm(url, fd);
      if (res.ok) showToast('Shikoyat yuborildi.', 'success');
      return;
    }

    const likeBtn = e.target.closest('.comment-like');
    const dislikeBtn = e.target.closest('.comment-dislike');
    if (likeBtn || dislikeBtn) {
      if (!isAuth) {
        showToast('Reaksiya uchun tizimga kiring.', 'error');
        return;
      }
      const commentEl = (likeBtn || dislikeBtn).closest('.comment-item');
      const url = urlFromTemplate(reactTpl, commentEl.dataset.commentId);
      const fd = new FormData();
      fd.append('value', likeBtn ? '1' : '-1');
      const res = await postForm(url, fd);
      if (res.ok) {
        qs('.comment-like-count', commentEl).textContent = res.data.likes;
        qs('.comment-dislike-count', commentEl).textContent = res.data.dislikes;
      }
      return;
    }

    const editBtn = e.target.closest('.comment-edit');
    if (editBtn) {
      const commentEl = editBtn.closest('.comment-item');
      const form = qs('.comment-edit-form', commentEl);
      const textarea = qs('textarea', form);
      textarea.value = commentEl.dataset.bodyRaw || '';
      const counter = qs('.comment-edit-counter', form);
      updateCounter(textarea, counter);
      form.classList.remove('hidden');
      textarea.focus();
      return;
    }

    const editCancel = e.target.closest('.comment-edit-cancel');
    if (editCancel) {
      const form = editCancel.closest('.comment-edit-form');
      form.classList.add('hidden');
      return;
    }

    const deleteBtn = e.target.closest('.comment-delete');
    if (deleteBtn) {
      const ok = confirm('Izohni o‘chirasizmi?');
      if (!ok) return;
      const commentEl = deleteBtn.closest('.comment-item');
      const url = urlFromTemplate(deleteTpl, commentEl.dataset.commentId);
      const res = await postForm(url, new FormData());
      if (res.ok) {
        const parentId = commentEl.dataset.parentId;
        if (!parentId) {
          await loadFeed(true);
          return;
        }
        const parentEl = findCommentElById(parentId, root);
        if (!parentEl) {
          await loadFeed(true);
          return;
        }
        if (res.data.parent_replies_count !== null && res.data.parent_replies_count !== undefined) {
          syncRepliesToggle(parentEl, res.data.parent_replies_count);
        }
        await refreshCommentBranch(parentEl);
      }
      return;
    }

    const pinBtn = e.target.closest('.comment-pin');
    if (pinBtn) {
      const commentEl = pinBtn.closest('.comment-item');
      const url = urlFromTemplate(pinTpl, commentEl.dataset.commentId);
      const res = await postForm(url, new FormData());
      if (res.ok) loadFeed(true);
      return;
    }

    const modBtn = e.target.closest('.comment-moderate');
    if (modBtn) {
      const commentEl = modBtn.closest('.comment-item');
      const targetUserId = commentEl.dataset.commentUserId;
      const input = prompt('Moderatsiya: mute 24h | mute 7d | ban | shadowban | unshadowban | unban | unmute');
      if (!input) return;
      const val = input.trim().toLowerCase();
      const fd = new FormData();
      fd.append('user_id', targetUserId);
      if (val === 'ban') {
        fd.append('kind', 'ban');
        fd.append('permanent', '1');
      } else if (val === 'shadowban') {
        fd.append('kind', 'shadowban');
        fd.append('permanent', '1');
      } else if (val === 'unshadowban') {
        fd.append('kind', 'shadowban');
        fd.append('action', 'remove');
      } else if (val === 'unban') {
        fd.append('kind', 'ban');
        fd.append('action', 'remove');
      } else if (val === 'unmute') {
        fd.append('kind', 'mute');
        fd.append('action', 'remove');
      } else if (val === 'mute 24h') {
        fd.append('kind', 'mute');
        fd.append('hours', '24');
      } else if (val === 'mute 7d') {
        fd.append('kind', 'mute');
        fd.append('days', '7');
      } else {
        showToast('Noto‘g‘ri buyruq.', 'error');
        return;
      }
      const res = await postForm(moderateUrl, fd);
      if (res.ok) showToast('Moderatsiya bajarildi.', 'success');
      return;
    }

    if (pendingToggle && pendingToggle.contains(e.target)) {
      if (!pendingList) return;
      if (!pendingLoaded) {
        const res = await fetch(pendingUrl, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        pendingList.innerHTML = await res.text();
        pendingLoaded = true;
      }
      pendingList.classList.toggle('hidden');
      return;
    }

    const pendingMore = e.target.closest('.pending-load-more');
    if (pendingMore) {
      const cursor = pendingMore.dataset.nextCursor;
      const url = new URL(pendingUrl, window.location.origin);
      if (cursor) url.searchParams.set('cursor', cursor);
      pendingMore.disabled = true;
      const res = await fetch(url.toString(), { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      const html = await res.text();
      const temp = document.createElement('div');
      temp.innerHTML = html;
      const newItems = qsa('.pending-item', temp);
      newItems.forEach(it => pendingList.appendChild(it));
      const newMore = qs('.pending-load-more', temp);
      if (newMore) {
        pendingMore.dataset.nextCursor = newMore.dataset.nextCursor;
        pendingMore.disabled = false;
      } else {
        pendingMore.remove();
      }
      return;
    }

    const pendingApprove = e.target.closest('.pending-approve');
    const pendingReject = e.target.closest('.pending-reject');
    if (pendingApprove || pendingReject) {
      const item = (pendingApprove || pendingReject).closest('.pending-item');
      const url = urlFromTemplate(pendingApprove ? approveTpl : rejectTpl, item.dataset.commentId);
      const res = await postForm(url, new FormData());
      if (res.ok) {
        item.remove();
        loadFeed(true);
      }
      return;
    }

    const pendingMute = e.target.closest('.pending-mute24');
    if (pendingMute) {
      const item = pendingMute.closest('.pending-item');
      const fd = new FormData();
      fd.append('user_id', item.dataset.commentUserId);
      fd.append('kind', 'mute');
      fd.append('hours', '24');
      await postForm(moderateUrl, fd);
      return;
    }
    const pendingBan = e.target.closest('.pending-ban');
    if (pendingBan) {
      const item = pendingBan.closest('.pending-item');
      const fd = new FormData();
      fd.append('user_id', item.dataset.commentUserId);
      fd.append('kind', 'ban');
      fd.append('permanent', '1');
      await postForm(moderateUrl, fd);
      return;
    }
    const pendingShadow = e.target.closest('.pending-shadowban');
    if (pendingShadow) {
      const item = pendingShadow.closest('.pending-item');
      const fd = new FormData();
      fd.append('user_id', item.dataset.commentUserId);
      fd.append('kind', 'shadowban');
      fd.append('permanent', '1');
      await postForm(moderateUrl, fd);
      return;
    }
  });

  root.addEventListener('change', async (e) => {
    const filterSelect = e.target.closest('.comment-filter-select');
    if (filterSelect) {
      state.filter = filterSelect.value || '';
      await loadFeed(true);
    }
  });

  root.addEventListener('submit', async (e) => {
    const form = e.target;
    if (form.id === 'comment-form') {
      e.preventDefault();
      if (!isAuth) {
        showToast('Izoh yozish uchun tizimga kiring.', 'error');
        return;
      }
      const submitBtn = qs('.comment-submit', form);
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Yuborilmoqda...';
      }
      const fd = new FormData(form);
      const res = await postForm(createUrl, fd);
      if (res.ok) {
        form.reset();
        qs('.comment-counter', form).textContent = `0/${maxLen}`;
        showToast(res.data.message || 'Izoh yuborildi.', 'success');
        if (!res.data.pending) {
          await loadFeed(true);
        }
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Yuborish';
      }
      return;
    }
    if (form.classList.contains('comment-reply-form')) {
      e.preventDefault();
      const commentEl = form.closest('.comment-item');
      const submitBtn = qs('button[type="submit"]', form);
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Yuborilmoqda...';
      }
      const fd = new FormData(form);
      fd.append('parent_id', commentEl.dataset.commentId);
      const res = await postForm(createUrl, fd);
      if (res.ok) {
        closeReplyForm(form, { reset: true });
        showToast(res.data.message || 'Izoh yuborildi.', 'success');
        if (res.data.parent_replies_count !== null && res.data.parent_replies_count !== undefined) {
          syncRepliesToggle(commentEl, res.data.parent_replies_count);
        }
        if (!res.data.pending) {
          await refreshCommentBranch(commentEl);
        }
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Yuborish';
      }
      return;
    }
    if (form.classList.contains('comment-edit-form')) {
      e.preventDefault();
      const commentEl = form.closest('.comment-item');
      const submitBtn = qs('button[type="submit"]', form);
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saqlanmoqda...';
      }
      const fd = new FormData(form);
      const url = urlFromTemplate(editTpl, commentEl.dataset.commentId);
      const res = await postForm(url, fd);
      if (res.ok) {
        showToast('Izoh tahrirlandi.', 'success');
        form.classList.add('hidden');
        const parentId = res.data.parent_id || commentEl.dataset.parentId;
        if (!parentId) {
          await loadFeed(true);
        } else {
          const parentEl = findCommentElById(parentId, root);
          if (!parentEl) {
            await loadFeed(true);
          } else {
            if (res.data.parent_replies_count !== null && res.data.parent_replies_count !== undefined) {
              syncRepliesToggle(parentEl, res.data.parent_replies_count);
            }
            await refreshCommentBranch(parentEl);
          }
        }
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Saqlash';
      }
      return;
    }
  });

  init();
}

window.initMangaComments = initMangaComments;

document.addEventListener('DOMContentLoaded', () => {
  initMangaComments();
});
