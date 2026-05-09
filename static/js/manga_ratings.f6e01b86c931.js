function getRatingCSRFToken() {
  const el = document.querySelector('meta[name="csrf-token"]');
  return el ? el.content : '';
}

function ratingToast(text, type = 'info') {
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

function ratingUrlFromTemplate(template, id) {
  return template.replace('/0/', `/${id}/`);
}

function ratingQs(selector, root = document) {
  return root.querySelector(selector);
}

function initMangaRatings(root) {
  root = root || document.getElementById('ratings-root');
  if (!root || root.dataset.ratingsBound === '1') return;
  root.dataset.ratingsBound = '1';

  const form = document.getElementById('rating-form');
  const select = document.getElementById('ratingTranslatorSelect');
  const ratingInput = document.getElementById('ratingValue');
  const commentInput = document.getElementById('ratingComment');
  const counter = document.getElementById('ratingCommentCounter');
  const starsWrap = document.getElementById('ratingStars');
  const submitBtn = document.getElementById('ratingSubmitBtn');
  const errorBox = document.getElementById('ratingError');
  const reviewsList = document.getElementById('ratingReviewsList');
  const heroBtn = document.getElementById('rateOpenBtn');
  const reviewCountBadge = document.getElementById('ratingReviewCountBadge');
  const reviewCountLabel = document.getElementById('ratingReviewCountLabel');
  const maxLen = parseInt(root.dataset.maxLength || '1000', 10);

  function parseLocaleInt(value, fallback = 0) {
    if (value === undefined || value === null || value === '') return fallback;
    const normalized = String(value).replace(/[^\d-]/g, '');
    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function formatCount(value) {
    return new Intl.NumberFormat('uz-UZ').format(parseLocaleInt(value, 0));
  }

  function currentOption() {
    if (!select || select.selectedIndex < 0) return null;
    return select.options[select.selectedIndex];
  }

  function decodeComment(value) {
    if (!value) return '';
    try {
      return decodeURIComponent(value);
    } catch (error) {
      return value;
    }
  }

  function setError(text) {
    if (!errorBox) return;
    if (!text) {
      errorBox.textContent = '';
      errorBox.classList.add('hidden');
      return;
    }
    errorBox.textContent = text;
    errorBox.classList.remove('hidden');
  }

  function updateCounter() {
    if (!commentInput || !counter) return;
    counter.textContent = `${commentInput.value.length}/${maxLen}`;
  }

  function paintStars(value) {
    const numericValue = Number(value || 0);
    const selectedColor = '#fcd34d';
    const unselectedColor = '#64748b';
    if (starsWrap) {
      starsWrap.querySelectorAll('button[data-star]').forEach((button) => {
        const starValue = Number(button.dataset.star || 0);
        const icon = ratingQs('[data-rating-star-icon], i, svg', button);
        const isSelected = starValue <= numericValue;
        button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        button.classList.toggle('text-amber-300', isSelected);
        button.classList.toggle('text-slate-500', !isSelected);
        button.style.color = isSelected ? selectedColor : unselectedColor;
        if (icon) {
          icon.style.color = isSelected ? selectedColor : unselectedColor;
        }
      });
    }

  }

  function syncHeroButton() {
    if (!heroBtn || !select) return;
    const hasReview = Array.from(select.options).some((option) => Number(option.dataset.my || 0) > 0);
    heroBtn.textContent = hasReview ? 'Baho berilgan' : 'Tarjimaga baho berish';
  }

  function syncReviewCount(value) {
    if (value === undefined || value === null) return;
    const formatted = formatCount(value);
    if (reviewCountBadge) reviewCountBadge.textContent = `${formatted} ta`;
    if (reviewCountLabel) reviewCountLabel.textContent = `${formatted} ta`;
  }

  function syncFromOption() {
    const option = currentOption();
    if (!option) return;

    const myRating = parseLocaleInt(option.dataset.my, 0);
    if (ratingInput) ratingInput.value = myRating ? String(myRating) : '';
    if (commentInput) commentInput.value = decodeComment(option.dataset.comment || '');

    paintStars(myRating);
    updateCounter();
    setError('');

    if (submitBtn) {
      submitBtn.textContent = option.dataset.reviewId ? 'Bahoni yangilash' : 'Bahoni yuborish';
    }
  }

  function upsertReview(payload) {
    if (!reviewsList || !payload.review_html) return;

    const temp = document.createElement('div');
    temp.innerHTML = payload.review_html.trim();
    const item = temp.firstElementChild;
    if (!item) return;

    const emptyState = document.getElementById('ratingReviewsEmpty');
    if (emptyState) emptyState.remove();

    const existing = reviewsList.querySelector(`[data-review-id="${payload.review_id}"]`);
    if (existing) {
      existing.replaceWith(item);
      return;
    }

    reviewsList.prepend(item);
  }

  if (select) {
    select.addEventListener('change', syncFromOption);
  }

  if (commentInput) {
    commentInput.addEventListener('input', () => {
      updateCounter();
      setError('');
    });
  }

  if (starsWrap) {
    starsWrap.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-star]');
      if (!button) return;

      const value = parseLocaleInt(button.dataset.star, 0);
      if (![1, 2, 3, 4, 5].includes(value)) return;

      if (ratingInput) ratingInput.value = String(value);
      paintStars(value);
      setError('');
    });
  }

  if (form && select && ratingInput && commentInput && submitBtn) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const option = currentOption();
      if (!option) return;

      const rating = Number(ratingInput.value || 0);
      const comment = (commentInput.value || '').trim();

      if (!rating) {
        setError('Avval yulduz tanlang.');
        return;
      }

      if (!comment) {
        setError('Baho berishda izoh majburiy.');
        commentInput.focus();
        return;
      }

      if (comment.length > maxLen) {
        setError(`Izoh juda uzun. Maksimal ${maxLen} ta belgi.`);
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = option.dataset.reviewId ? 'Yangilanmoqda...' : 'Yuborilmoqda...';

      const formData = new FormData(form);
      formData.set('rating', String(rating));
      formData.set('comment', comment);
      formData.set('translator_id', option.value);

      try {
        const response = await fetch(ratingUrlFromTemplate(root.dataset.submitUrlTemplate, option.value), {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'X-CSRFToken': getRatingCSRFToken(),
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: formData,
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok) {
          const errorMessage = payload.error || 'Xatolik yuz berdi.';
          setError(errorMessage);
          ratingToast(errorMessage, 'error');
          return;
        }

        option.dataset.my = String(payload.my_rating !== undefined ? payload.my_rating : rating);
        option.dataset.comment = encodeURIComponent(payload.comment !== undefined ? payload.comment : comment);
        option.dataset.reviewId = String(payload.review_id || option.dataset.reviewId || '');

        syncFromOption();
        upsertReview(payload);
        syncReviewCount(payload.review_count);
        syncHeroButton();
        ratingToast(payload.created ? 'Bahongiz yuborildi.' : 'Bahongiz yangilandi.', 'success');
      } catch (error) {
        setError('Server bilan ulanishda xatolik yuz berdi.');
        ratingToast('Server bilan ulanishda xatolik yuz berdi.', 'error');
      } finally {
        submitBtn.disabled = false;
        const activeOption = currentOption();
        submitBtn.textContent = activeOption && activeOption.dataset.reviewId ? 'Bahoni yangilash' : 'Bahoni yuborish';
      }
    });
  }

  syncFromOption();
  updateCounter();
  syncHeroButton();
}

window.initMangaRatings = initMangaRatings;
document.addEventListener('DOMContentLoaded', () => initMangaRatings());
