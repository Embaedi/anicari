import { searchAnime, searchCommons, searchVideos, PROVIDERS } from './api.js';

/* Ganti setelah repo dibuat (lihat README). */
const REPO_URL = 'https://github.com/Embaedi/anicari';

const els = {
  form: document.getElementById('search-form'),
  input: document.getElementById('q'),
  btn: document.getElementById('search-btn'),
  tabs: Array.from(document.querySelectorAll('.tab')),
  chips: document.getElementById('chips'),
  status: document.getElementById('status'),
  results: document.getElementById('results'),
  more: document.getElementById('more'),
  modal: document.getElementById('modal'),
  modalBody: document.getElementById('modal-body'),
  modalClose: document.querySelector('.modal-close')
};

const SOURCES = {
  anime: (q, page) => searchAnime(q, page),
  photo: (q, page) => searchCommons(q, page, 'photo'),
  video: (q, page) => searchVideos(q, page)
};

const EMPTY = {
  anime: 'Tidak ada anime yang cocok. Coba judul lain atau ejaan bahasa Inggris.',
  photo: 'Tidak ada foto yang cocok. Coba kata kunci yang lebih umum.',
  video: 'Tidak ada video yang cocok. Coba "dokumenter", "film klasik", atau judul bahasa Inggris.'
};

const state = {
  q: '',
  tab: 'semua',
  page: { anime: 0, photo: 0, video: 0 },
  hasNext: { anime: false, photo: false, video: false },
  groups: {},
  reqId: 0,
  loading: false
};

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'attrs') for (const [a, v] of Object.entries(value)) node.setAttribute(a, v);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.append(child);
  }
  return node;
}

function metaLine(parts) {
  return parts.filter(Boolean).join(' · ');
}

function plural(n, word) {
  return `${n} ${word}`;
}

/* -------------------------------------------------------------------------- */
/* cards                                                                       */
/* -------------------------------------------------------------------------- */

function cardMeta(item) {
  if (item.kind === 'anime') {
    return metaLine([
      item.year,
      item.episodes ? `${item.episodes} ep` : null,
      item.score ? `★ ${item.score}` : null
    ]);
  }
  if (item.kind === 'photo') {
    return metaLine([item.license, item.artist]);
  }
  return metaLine([item.source, item.year, item.creator]);
}

function createCard(item) {
  const card = el('button', {
    class: 'card',
    type: 'button',
    dataset: { type: item.kind, id: item.id },
    attrs: { 'aria-label': `${item.title} — buka detail` }
  });

  const media = el('div', { class: 'media' });
  const fallback = el('span', { class: 'fallback', text: item.kind === 'anime' ? '◕' : item.kind === 'photo' ? '▣' : '▶' });
  media.append(fallback);

  if (item.thumb) {
    const img = el('img', {
      src: item.thumb,
      alt: item.title,
      loading: 'lazy',
      decoding: 'async',
      referrerPolicy: 'no-referrer'
    });
    img.addEventListener('error', () => img.remove());
    media.append(img);
  }

  if (item.kind === 'video') {
    media.append(el('span', { class: 'play', 'aria-hidden': 'true' }, el('span', { text: '▶' })));
  }

  media.append(el('span', { class: 'badge', dataset: { kind: item.kind }, text: item.kind }));

  const meta = cardMeta(item);
  const body = el('div', { class: 'card-body' }, [
    el('p', { class: 'card-title', text: item.title }),
    meta ? el('p', { class: 'card-meta', text: meta }) : null
  ]);

  card.append(media, body);
  card.addEventListener('click', () => openModal(item));
  return card;
}

function skeletonCards(type, count) {
  const cards = [];
  for (let i = 0; i < count; i += 1) {
    cards.push(
      el('div', { class: 'card skeleton', dataset: { type }, attrs: { 'aria-hidden': 'true' } }, [
        el('div', { class: 'media' }),
        el('div', { class: 'card-body' }, [
          el('div', { class: 'bar' }),
          el('div', { class: 'bar short' })
        ])
      ])
    );
  }
  return cards;
}

/* -------------------------------------------------------------------------- */
/* result groups                                                               */
/* -------------------------------------------------------------------------- */

function ensureGroup(type) {
  if (state.groups[type]) return state.groups[type];

  const label = PROVIDERS[type] ? PROVIDERS[type].label : type;
  const count = el('small', { text: '' });
  const head = el('div', { class: 'group-head' }, [
    el('h2', { class: 'group-title' }, [el('span', { class: 'dot' }), document.createTextNode(` ${type === 'anime' ? 'Anime' : type === 'photo' ? 'Foto' : 'Video'} `), count]),
    type === 'anime'
      ? el('button', { class: 'group-link', type: 'button', text: 'Lihat semua anime →', dataset: { see: 'anime' } })
      : el('button', { class: 'group-link', type: 'button', text: 'Lihat semua →', dataset: { see: type } })
  ]);

  const grid = el('div', { class: 'grid', dataset: { type } });
  const section = el('section', { class: 'group', dataset: { group: type } }, [head, grid]);
  if (state.tab !== 'semua') section.classList.add('group--single');

  els.results.append(section);
  const group = { section, grid, count, head, label, skeletons: [] };
  state.groups[type] = group;

  const see = head.querySelector('[data-see]');
  see.addEventListener('click', () => {
    setTab(type);
    performSearch();
  });

  return group;
}

function fillGroup(type, items, { reset = false, error = null } = {}) {
  const group = ensureGroup(type);
  group.head.hidden = state.tab !== 'semua';

  for (const node of group.skeletons) node.remove();
  group.skeletons = [];
  group.grid.querySelectorAll('.note').forEach((n) => n.remove());

  if (reset) {
    group.grid.replaceChildren();
    group.count.textContent = '';
  }

  if (error && items.length === 0) {
    group.grid.append(errorNote(type, error));
    return;
  }

  if (items.length === 0) {
    group.grid.append(emptyNote(EMPTY[type]));
    return;
  }

  const frag = document.createDocumentFragment();
  for (const item of items) frag.append(createCard(item));
  group.grid.append(frag);

  const shown = group.grid.querySelectorAll('.card').length;
  group.count.textContent = `· ${shown} hasil`;
}

function emptyNote(message) {
  return el('p', { class: 'note', attrs: { role: 'status' } }, [
    el('strong', { text: 'Hmm, kosong. ' }),
    document.createTextNode(message)
  ]);
}

function errorNote(type, error) {
  const label = PROVIDERS[type] ? PROVIDERS[type].label : type;
  const note = el('p', { class: 'note', attrs: { role: 'alert' } }, [
    el('strong', { text: `Gagal memuat dari ${label}. ` }),
    document.createTextNode(error && error.message ? `(${error.message}) ` : ''),
    el('br'),
    el('button', { class: 'retry', type: 'button', text: 'Coba lagi' })
  ]);
  note.querySelector('.retry').addEventListener('click', () => performSearch());
  return note;
}

/* -------------------------------------------------------------------------- */
/* searching                                                                   */
/* -------------------------------------------------------------------------- */

function activeTypes() {
  return state.tab === 'semua' ? ['anime', 'photo', 'video'] : [state.tab];
}

async function performSearch({ append = false } = {}) {
  const q = state.q.trim();
  const desired = append ? [state.tab] : activeTypes();
  const reqId = ++state.reqId;

  setLoading(true);
  els.more.hidden = true;

  if (!append) {
    state.groups = {};
    els.results.replaceChildren();
    state.page = { anime: 0, photo: 0, video: 0 };
    state.hasNext = { anime: false, photo: false, video: false };

    for (const type of desired) {
      const group = ensureGroup(type);
      group.skeletons = skeletonCards(type, type === 'video' ? 6 : type === 'photo' ? 8 : 6);
      group.grid.append(...group.skeletons);
      group.count.textContent = '· memuat…';
    }

    els.status.textContent = q
      ? `Mencari “${q}”…`
      : 'Mengambil rekomendasi populer…';
  }

  const jobs = desired.map(async (type) => {
    if (append && !state.hasNext[type]) return { type, skipped: true, items: [], hasNext: false, page: state.page[type] };
    const nextPage = append ? state.page[type] + 1 : 1;
    try {
      const result = await SOURCES[type](q, nextPage);
      return { type, items: result.items, hasNext: result.hasNext, page: nextPage };
    } catch (error) {
      return { type, items: [], hasNext: false, page: nextPage, error };
    }
  });

  const results = await Promise.all(jobs);
  if (reqId !== state.reqId) return;

  const problems = [];

  for (const result of results) {
    if (result.skipped) continue;
    const { type } = result;
    state.page[type] = result.page;
    state.hasNext[type] = Boolean(result.hasNext);
    if (result.error) problems.push(type);
    fillGroup(type, result.items, { reset: !append, error: result.error || null });
  }

  setLoading(false);

  const total = els.results.querySelectorAll('.card:not(.skeleton)').length;
  if (q) {
    els.status.textContent = `Hasil untuk “${q}” — ${plural(total, 'item')}${
      problems.length ? ` · gagal: ${problems.map((t) => PROVIDERS[t].label).join(', ')}` : ''
    }`;
  } else {
    els.status.textContent = `Rekomendasi populer — ${plural(total, 'item')}. Ketik kata kunci untuk mencari lebih banyak.`;
  }

  updateMore();
  updateTabUI();
  syncURL();
}

function updateMore() {
  const show = state.tab !== 'semua' && state.hasNext[state.tab];
  els.more.hidden = !show;
  els.more.disabled = false;
  els.more.textContent = 'Muat lebih banyak';
}

function setLoading(loading) {
  state.loading = loading;
  els.btn.disabled = loading;
  els.btn.textContent = loading ? 'Mencari…' : 'Cari';
  els.more.disabled = loading;
}

/* -------------------------------------------------------------------------- */
/* tabs & URL                                                                  */
/* -------------------------------------------------------------------------- */

function setTab(tab, { silent = false } = {}) {
  if (!['semua', 'anime', 'photo', 'video'].includes(tab)) return;
  state.tab = tab;
  updateTabUI();
  if (!silent) syncURL();
}

function updateTabUI() {
  for (const tab of els.tabs) {
    const active = tab.dataset.tab === state.tab;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  }
  for (const group of Object.values(state.groups)) {
    const single = state.tab !== 'semua';
    group.section.classList.toggle('group--single', single);
    group.head.hidden = single;
  }
}

function syncURL() {
  try {
    const params = new URLSearchParams();
    if (state.q.trim()) params.set('q', state.q.trim());
    if (state.tab !== 'semua') params.set('tab', state.tab);
    const query = params.toString();
    history.replaceState(null, '', query ? `?${query}` : location.pathname);
  } catch {
    /* file:// atau mode privasi ketat — abaikan */
  }
}

function readURL() {
  try {
    const params = new URLSearchParams(location.search);
    state.q = params.get('q') || '';
    const tab = params.get('tab');
    if (['anime', 'photo', 'video'].includes(tab)) state.tab = tab;
  } catch {
    state.q = '';
  }
  els.input.value = state.q;
  updateTabUI();
}

/* -------------------------------------------------------------------------- */
/* modal                                                                       */
/* -------------------------------------------------------------------------- */

let lastFocused = null;

function closeModal() {
  if (els.modal.hidden) return;
  els.modal.hidden = true;
  els.modalBody.replaceChildren();
  document.body.classList.remove('is-locked');
  if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  lastFocused = null;
}

function openModal(item) {
  lastFocused = document.activeElement;
  const body = els.modalBody;
  body.replaceChildren();

  if (item.kind === 'anime') body.append(animeModal(item));
  else if (item.kind === 'photo') body.append(photoModal(item));
  else body.append(videoModal(item));

  els.modal.hidden = false;
  document.body.classList.add('is-locked');
  els.modalClose.focus();
}

function actionLink(href, label, primary = false) {
  return el('a', {
    class: primary ? 'btn btn-primary' : 'btn',
    href,
    target: '_blank',
    rel: 'noopener noreferrer',
    text: label
  });
}

function animeModal(item) {
  const hero = el('div', { class: 'modal-hero' });
  if (item.banner) {
    hero.append(el('img', { src: item.banner, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' }));
  } else {
    hero.style.background = `linear-gradient(135deg, ${item.color || '#1a1f2e'}, #10131c)`;
    hero.style.height = '120px';
  }

  const info = el('div', { class: 'modal-info' }, [
    el('h2', { class: 'modal-title', id: 'modal-title', text: item.title }),
    item.altTitle && item.altTitle !== item.title
      ? el('p', { class: 'modal-sub', text: item.altTitle })
      : null,
    el('p', {
      class: 'modal-sub',
      text: metaLine([item.year, item.episodes ? `${item.episodes} episode` : null, item.duration ? `${item.duration} menit/ep` : null, item.score ? `★ ${item.score}/100` : null, item.format])
    })
  ]);

  if (item.genres.length) {
    info.append(el('div', { class: 'modal-tags' }, item.genres.map((g) => el('span', { class: 'tag', text: g }))));
  }

  const head = el('div', { class: 'modal-head' }, [
    item.poster ? el('div', { class: 'modal-poster' }, el('img', { src: item.poster, alt: item.title, referrerPolicy: 'no-referrer' })) : null,
    info
  ]);
  if (!item.banner) head.style.marginTop = '20px';

  const wrap = el('div', { class: 'modal-inner' }, [head]);

  if (item.description) {
    wrap.append(el('p', { class: 'modal-desc', text: item.description }));
  }

  wrap.append(el('div', { class: 'modal-actions' }, [actionLink(item.sourceUrl, 'Buka di AniList', true)]));

  if (item.trailer) {
    wrap.append(
      el('div', { class: 'modal-media' },
        el('iframe', {
          src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(item.trailer)}?rel=0`,
          title: `Trailer ${item.title}`,
          loading: 'lazy',
          allow: 'accelerometer; encrypted-media; picture-in-picture; fullscreen',
          allowfullscreen: true
        })
      )
    );
  }

  const frag = document.createDocumentFragment();
  frag.append(hero, wrap);
  return frag;
}

function photoModal(item) {
  const wrap = el('div', { class: 'modal-inner' }, [
    el('h2', { class: 'modal-title', id: 'modal-title', text: item.title }),
    el('p', { class: 'modal-sub', text: metaLine([item.source, item.artist, item.license]) })
  ]);

  if (item.full) {
    wrap.append(el('figure', { class: 'modal-photo' }, el('img', { src: item.full, alt: item.title, loading: 'lazy', referrerPolicy: 'no-referrer' })));
  }
  if (item.description) {
    wrap.append(el('p', { class: 'modal-desc', text: item.description }));
  }
  wrap.append(
    el('div', { class: 'modal-actions' }, [actionLink(item.pageUrl, 'Buka di Wikimedia Commons', true)]),
    el('p', { class: 'modal-credit', text: 'Lisensi & atribusi lengkap tersedia di halaman sumber.' })
  );
  return wrap;
}

function videoModal(item) {
  const wrap = el('div', { class: 'modal-inner' }, [
    el('h2', { class: 'modal-title', id: 'modal-title', text: item.title }),
    el('p', { class: 'modal-sub', text: metaLine([item.source, item.year, item.creator]) })
  ]);

  if (item.mime && item.full && item.mime.startsWith('video/')) {
    wrap.append(
      el('div', { class: 'modal-media' },
        el('video', { src: item.full, poster: item.thumb, controls: true, preload: 'metadata' })
      )
    );
  } else if (item.embedUrl) {
    wrap.append(
      el('div', { class: 'modal-media' },
        el('iframe', {
          src: `${item.embedUrl}?autoplay=0`,
          title: item.title,
          loading: 'lazy',
          allow: 'fullscreen; picture-in-picture',
          allowfullscreen: true
        })
      )
    );
  }

  if (item.description) {
    wrap.append(el('p', { class: 'modal-desc', text: item.description }));
  }
  wrap.append(
    el('div', { class: 'modal-actions' }, [actionLink(item.pageUrl, 'Buka halaman sumber', true)]),
    el('p', { class: 'modal-credit', text: 'Video diputar langsung dari penyedia aslinya. Hak cipta milik pembuat masing-masing.' })
  );
  return wrap;
}

/* -------------------------------------------------------------------------- */
/* events                                                                      */
/* -------------------------------------------------------------------------- */

function submitSearch(rawQuery) {
  const value = String(rawQuery ?? els.input.value ?? '').trim();
  state.q = value;
  els.input.value = value;
  performSearch();
}

els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  submitSearch();
});

for (const tab of els.tabs) {
  tab.addEventListener('click', () => {
    if (state.tab === tab.dataset.tab) return;
    setTab(tab.dataset.tab, { silent: true });
    performSearch();
  });
}

els.chips.addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip) return;
  submitSearch(chip.dataset.q);
});

els.more.addEventListener('click', () => {
  if (state.loading) return;
  performSearch({ append: true });
});

els.modal.addEventListener('click', (event) => {
  if (event.target.closest('[data-close]')) closeModal();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !els.modal.hidden) closeModal();

  if (event.key === '/' && els.modal.hidden) {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    event.preventDefault();
    els.input.focus();
  }

  if (event.key === 'Tab' && !els.modal.hidden) {
    const focusables = Array.from(
      els.modal.querySelectorAll('a[href], button:not([disabled]), iframe, video, [tabindex="0"]')
    ).filter((node) => node.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

window.addEventListener('popstate', () => {
  readURL();
  performSearch();
});

/* -------------------------------------------------------------------------- */
/* boot                                                                        */
/* -------------------------------------------------------------------------- */

function applyRepoLinks() {
  for (const id of ['repo-link', 'repo-link-2']) {
    const link = document.getElementById(id);
    if (!link) continue;
    link.href = REPO_URL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
}

applyRepoLinks();
readURL();
performSearch();
