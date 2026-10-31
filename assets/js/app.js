import { ALL_SOURCES, createCustomSource } from './api.js';

/* Ganti setelah repo dibuat (lihat README). */
const REPO_URL = 'https://github.com/Embaedi/anicari';

const KIND_LABEL = { anime: 'Anime', photo: 'Foto', video: 'Video' };
const PRIMARY = { anime: 'anilist', photo: 'commons', video: 'archive' };
const STORE = {
  disabled: 'anicari.disabled',
  enabled: 'anicari.sources.enabled',
  custom: 'anicari.custom',
  sort: 'anicari.sort',
  click: 'anicari.clickMode',
  progress: 'anicari.progress'
};

const els = {
  form: document.getElementById('search-form'),
  input: document.getElementById('q'),
  btn: document.getElementById('search-btn'),
  tabs: Array.from(document.querySelectorAll('.tab')),
  chips: document.getElementById('chips'),
  status: document.getElementById('status'),
  sortWrap: document.getElementById('sort-wrap'),
  sort: document.getElementById('sort'),
  clickDetail: document.getElementById('click-detail'),
  clickSource: document.getElementById('click-source'),
  clearProgress: document.getElementById('clear-progress'),
  progressCount: document.getElementById('progress-count'),
  results: document.getElementById('results'),
  more: document.getElementById('more'),
  modal: document.getElementById('modal'),
  modalBody: document.getElementById('modal-body'),
  modalClose: document.querySelector('#modal .modal-close'),
  sourcesBtn: document.getElementById('sources-btn'),
  settings: document.getElementById('settings'),
  settingsClose: document.querySelector('#settings .modal-close'),
  sourceList: document.getElementById('source-list'),
  sourceFilter: document.getElementById('source-filter'),
  sourceTotal: document.getElementById('source-total'),
  customList: document.getElementById('custom-list'),
  customForm: document.getElementById('custom-form'),
  customStatus: document.getElementById('custom-status'),
  cfName: document.getElementById('cf-name'),
  cfKind: document.getElementById('cf-kind'),
  cfUrl: document.getElementById('cf-url'),
  cfHeaders: document.getElementById('cf-headers'),
  cfItems: document.getElementById('cf-items'),
  cfTitle: document.getElementById('cf-title'),
  cfThumb: document.getElementById('cf-thumb'),
  cfLink: document.getElementById('cf-link'),
  cfDesc: document.getElementById('cf-desc'),
  cfTest: document.getElementById('cf-test')
};

const SOURCE_HINT = {
  anime: 'Tidak ada anime yang cocok. Coba judul lain atau ejaan bahasa Inggris.',
  photo: 'Tidak ada foto yang cocok. Coba kata kunci yang lebih umum.',
  video: 'Tidak ada video yang cocok. Coba "dokumenter", "film klasik", atau judul bahasa Inggris.'
};

/* -------------------------------------------------------------------------- */
/* storage                                                                     */
/* -------------------------------------------------------------------------- */

function loadJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* localStorage penuh/diblokir — abaikan */
  }
}

function normalizeProgress(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [id, entry] of Object.entries(value)) {
    if (!entry || !entry.item || typeof entry.item.title !== 'string') continue;
    out[id] = {
      item: entry.item,
      episode: Math.max(0, Number(entry.episode) || 0),
      total: Math.max(0, Number(entry.total) || Number(entry.item.episodes) || 0),
      updated: Number(entry.updated) || 0
    };
  }
  return out;
}

function normalizeCustom(configs) {
  if (!Array.isArray(configs)) return [];
  return configs.filter((config) => (
    config
    && typeof config.id === 'string'
    && typeof config.name === 'string'
    && (config.kind === 'photo' || config.kind === 'video')
    && typeof config.url === 'string'
  ));
}

const storedEnabled = loadJSON(STORE.enabled, null);
const legacyDisabled = new Set(loadJSON(STORE.disabled, []));
const defaultEnabled = ALL_SOURCES.filter((source) => source.defaultEnabled).map((source) => source.id);
const initialEnabled = Array.isArray(storedEnabled)
  ? storedEnabled
  : ALL_SOURCES
    .filter((source) => source.defaultEnabled && !legacyDisabled.has(source.id))
    .map((source) => source.id);

const state = {
  q: '',
  tab: 'semua',
  enabled: new Set(initialEnabled),
  customConfigs: normalizeCustom(loadJSON(STORE.custom, [])),
  progress: normalizeProgress(loadJSON(STORE.progress, {})),
  sort: loadJSON(STORE.sort, 'popular'),
  clickMode: loadJSON(STORE.click, 'detail') === 'source' ? 'source' : 'detail',
  sources: [],
  pages: {},
  hasNext: {},
  groups: {},
  reqId: 0,
  loading: false
};

function buildSources() {
  const enabledBuiltins = ALL_SOURCES.filter((source) => state.enabled.has(source.id));
  const customs = state.customConfigs.map((config) => createCustomSource(config));
  state.sources = [...enabledBuiltins, ...customs];
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'attrs') for (const [attr, val] of Object.entries(value)) node.setAttribute(attr, val);
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

function sourceSummary(labels) {
  const unique = [...new Set(labels)];
  if (unique.length <= 3) return unique.join(', ');
  return `${unique.slice(0, 3).join(', ')} +${unique.length - 3} lain`;
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
    return metaLine([item.source, item.license]);
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
  const fallback = el('span', {
    class: 'fallback',
    text: item.kind === 'anime' ? '◕' : item.kind === 'photo' ? '▣' : '▶'
  });
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
  if (item.kind === 'anime') renderProgressBadge(card, item);
  card.addEventListener('click', () => {
    const target = item.pageUrl || item.sourceUrl;
    if (state.clickMode === 'source' && target) {
      window.open(target, '_blank', 'noopener');
      return;
    }
    openModal(item);
  });
  return card;
}


/* -------------------------------------------------------------------------- */
/* progres tontonan                                                            */
/* -------------------------------------------------------------------------- */

function persistProgress() {
  saveJSON(STORE.progress, state.progress);
}

function updateSettingsProgressCount() {
  if (!els.progressCount) return;
  const total = Object.keys(state.progress).length;
  els.progressCount.textContent = total ? `${total} anime disimpan` : 'Belum ada progres.';
}

function renderProgressBadge(card, item) {
  const media = card.querySelector('.media');
  if (!media) return;
  media.querySelectorAll('.progress-flag, .card-progress').forEach((node) => node.remove());

  const entry = state.progress[item.id];
  if (!entry || !entry.episode) return;

  const total = entry.total || Number(item.episodes) || 0;
  media.append(el('span', { class: 'progress-flag', text: `Ep ${entry.episode}${total ? `/${total}` : ''}` }));
  if (total) {
    media.append(
      el('span', { class: 'card-progress' },
        el('span', { attrs: { style: `width:${Math.min(100, (entry.episode / total) * 100)}%` } })
      )
    );
  }
}

function refreshCardProgress(id) {
  const entry = state.progress[id];
  for (const card of document.querySelectorAll(`.card[data-type="anime"][data-id="${id}"]`)) {
    if (entry) renderProgressBadge(card, entry.item);
    else card.querySelectorAll('.progress-flag, .card-progress').forEach((node) => node.remove());
  }
}

function setProgress(item, episode) {
  const total = Number(item.episodes) || 0;
  const max = total || 9999;
  const next = Math.max(0, Math.min(max, Number(episode) || 0));

  if (next <= 0) delete state.progress[item.id];
  else state.progress[item.id] = { item: { ...item }, episode: next, total, updated: Date.now() };

  const entries = Object.entries(state.progress)
    .sort((a, b) => b[1].updated - a[1].updated)
    .slice(0, 80);
  state.progress = Object.fromEntries(entries);

  persistProgress();
  refreshCardProgress(item.id);
  updateSettingsProgressCount();
}

function progressBox(item) {
  const box = el('div', { class: 'progress-box' });

  const render = () => {
    const entry = state.progress[item.id];
    const episode = entry ? entry.episode : 0;
    const total = Number(item.episodes) || (entry && entry.total) || 0;
    const next = total ? Math.min(episode + 1, total) : episode + 1;
    const done = total > 0 && episode >= total;
    const percent = total ? Math.min(100, (episode / total) * 100) : (episode ? 100 : 0);

    const actions = [];
    if (episode > 0) {
      const minus = el('button', { class: 'btn btn-small', type: 'button', text: '− 1 episode' });
      minus.addEventListener('click', () => { setProgress(item, episode - 1); render(); });
      actions.push(minus);
    }

    const mark = el('button', {
      class: 'btn btn-primary',
      type: 'button',
      text: done ? `Sudah tamat (${total} ep)` : `Tandai Ep ${next} selesai`
    });
    mark.disabled = done;
    mark.addEventListener('click', () => { if (!done) setProgress(item, next); render(); });
    actions.push(mark);

    if (episode > 0) {
      const reset = el('button', { class: 'btn btn-small', type: 'button', text: 'Reset' });
      reset.addEventListener('click', () => { setProgress(item, 0); render(); });
      actions.push(reset);
    }

    box.replaceChildren(
      el('div', { class: 'progress-head' }, [
        el('strong', { text: 'Progres tontonan' }),
        el('span', { text: episode ? `Ep ${episode}${total ? ` / ${total}` : ''}` : 'Belum dimulai' })
      ]),
      el('div', { class: 'progress-bar' }, el('span', { attrs: { style: `width:${percent}%` } })),
      el('div', { class: 'progress-actions' }, actions),
      el('p', { class: 'hint', text: 'Tersimpan di browser ini — tanpa akun. Untuk episode penuh, buka situs sumber.' })
    );
  };

  render();
  return box;
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

function ensureGroup(source) {
  const key = source.id;
  if (state.groups[key]) return state.groups[key];

  const count = el('small', { text: '' });
  const head = el('div', { class: 'group-head' }, [
    el('h2', { class: 'group-title' }, [
      el('span', { class: 'dot' }),
      document.createTextNode(`${KIND_LABEL[source.kind]} · dari ${source.label} `),
      count
    ]),
    el('button', {
      class: 'group-link',
      type: 'button',
      text: 'Lihat semua →',
      dataset: { see: source.kind }
    })
  ]);

  const grid = el('div', { class: 'grid', dataset: { type: source.kind } });
  const section = el('section', { class: 'group', dataset: { group: key } }, [head, grid]);
  els.results.append(section);

  const group = { section, grid, count, head, skeletons: [] };
  state.groups[key] = group;

  head.querySelector('[data-see]').addEventListener('click', () => {
    setTab(source.kind);
    performSearch();
  });

  return group;
}

function ensureMergedGroup() {
  if (state.groups.merged) return state.groups.merged;

  const grid = el('div', { class: 'grid', dataset: { type: state.tab } });
  const section = el('section', { class: 'group', dataset: { group: 'merged' } }, [
    el('div', { class: 'group-head', hidden: true }),
    grid
  ]);
  els.results.append(section);

  const group = { section, grid, count: null, head: null, skeletons: [] };
  state.groups.merged = group;
  return group;
}

function emptyNote(kind) {
  return el('p', { class: 'note', attrs: { role: 'status' } }, [
    el('strong', { text: 'Hmm, kosong. ' }),
    document.createTextNode(SOURCE_HINT[kind] || 'Tidak ada hasil.')
  ]);
}

function errorNote(kind, labels) {
  const note = el('p', { class: 'note', attrs: { role: 'alert' } }, [
    el('strong', { text: 'Sebagian sumber gagal dimuat. ' }),
    document.createTextNode(`${labels.join(', ')} — coba lagi atau matikan sumber tersebut di menu Sumber. `),
    el('button', { class: 'retry', type: 'button', text: 'Coba lagi' })
  ]);
  note.querySelector('.retry').addEventListener('click', () => performSearch());
  return note;
}

function fillGroup(group, kind, items, error) {
  for (const node of group.skeletons) node.remove();
  group.skeletons = [];
  group.grid.querySelectorAll('.note').forEach((node) => node.remove());
  group.grid.replaceChildren();

  if (error && items.length === 0) {
    group.grid.append(errorNote(kind, error.labels));
  } else if (items.length === 0) {
    group.grid.append(emptyNote(kind));
  } else {
    group.grid.append(...items.map(createCard));
  }

  if (group.count) group.count.textContent = `· ${items.length} hasil`;
}

function appendCards(group, items) {
  if (!items.length) return;
  group.grid.append(...items.map(createCard));
}

/* -------------------------------------------------------------------------- */
/* searching                                                                   */
/* -------------------------------------------------------------------------- */

function activeSources() {
  if (state.tab === 'semua') {
    const picked = [];
    for (const kind of ['anime', 'photo', 'video']) {
      const ofKind = state.sources.filter((source) => source.kind === kind);
      const preferred = ofKind.find((source) => source.id === PRIMARY[kind]) || ofKind[0];
      if (preferred) picked.push(preferred);
    }
    return picked;
  }
  return state.sources.filter((source) => source.kind === state.tab);
}

function renderContinue() {
  const entries = Object.values(state.progress)
    .sort((a, b) => b.updated - a.updated)
    .slice(0, 12);
  if (!entries.length) return;

  const grid = el('div', { class: 'grid', dataset: { type: 'anime' } });
  for (const entry of entries) grid.append(createCard(entry.item));

  els.results.append(
    el('section', { class: 'group group--continue' }, [
      el('div', { class: 'group-head' }, [
        el('h2', { class: 'group-title' }, [
          el('span', { class: 'dot dot-green' }),
          document.createTextNode('Lanjutkan menonton '),
          el('small', { text: `· ${entries.length} anime` })
        ])
      ]),
      grid
    ])
  );
}

async function runSource(source, page) {
  try {
    const sort = state.tab === 'semua' ? 'popular' : state.sort;
    const result = await source.search(state.q.trim(), page, sort);
    return { source, items: Array.isArray(result.items) ? result.items : [], hasNext: Boolean(result.hasNext) };
  } catch (error) {
    return { source, items: [], hasNext: false, error: error || new Error('gagal') };
  }
}

async function performSearch({ append = false } = {}) {
  const reqId = ++state.reqId;
  const q = state.q.trim();

  setLoading(true);

  if (!append) {
    state.pages = {};
    state.hasNext = {};
    state.groups = {};
    els.results.replaceChildren();
    els.more.hidden = true;

    if (!q && state.tab === 'semua') renderContinue();

    const initial = activeSources();
    if (initial.length === 0) {
      setLoading(false);
      showNoSources();
      return;
    }

    if (state.tab === 'semua') {
      for (const source of initial) {
        const group = ensureGroup(source);
        group.skeletons = skeletonCards(source.kind, 6);
        group.grid.append(...group.skeletons);
        group.count.textContent = '· memuat…';
      }
    } else {
      const group = ensureMergedGroup();
      group.skeletons = skeletonCards(state.tab, 12);
      group.grid.append(...group.skeletons);
    }

    els.status.textContent = q ? `Mencari “${q}”…` : 'Mengambil rekomendasi populer…';
  }

  const targets = append
    ? state.sources.filter((source) => source.kind === state.tab && state.hasNext[source.id])
    : activeSources();

  if (append && targets.length === 0) {
    setLoading(false);
    updateMore();
    return;
  }

  const failed = [];
  let remaining = targets.length;

  const finish = () => {
    if (reqId !== state.reqId) return;

    if (!append && state.tab !== 'semua') {
      const group = state.groups.merged;
      if (group) {
        for (const node of group.skeletons) node.remove();
        group.skeletons = [];
        if (!group.grid.querySelector('.card') && !failed.length) {
          group.grid.append(emptyNote(state.tab));
        }
      }
    }

    if (state.tab !== 'semua' && failed.length) {
      state.groups.merged.grid.append(errorNote(state.tab, failed.map((source) => source.label)));
    }

    setLoading(false);
    updateStatus(failed);
    updateMore();
    syncURL();
  };

  for (const source of targets) {
    const page = append ? (state.pages[source.id] || 0) + 1 : 1;
    runSource(source, page)
      .then((result) => {
        if (reqId !== state.reqId) return;
        state.pages[source.id] = page;
        state.hasNext[source.id] = result.hasNext;
        if (result.error) failed.push(source);

        if (state.tab !== 'semua') {
          const group = state.groups.merged;
          for (const node of group.skeletons) node.remove();
          group.skeletons = [];
        }

        if (state.tab === 'semua' && !append) {
          fillGroup(
            state.groups[source.id],
            source.kind,
            result.items,
            result.error ? { labels: [source.label] } : null
          );
        } else {
          appendCards(state.groups.merged, result.items);
        }
      })
      .finally(() => {
        if (reqId !== state.reqId) return;
        remaining -= 1;
        if (remaining === 0) finish();
      });
  }
}

function updateStatus(failed = []) {
  const q = state.q.trim();
  const continueCards = els.results.querySelectorAll('.group--continue .card').length;
  const total = els.results.querySelectorAll('.card:not(.skeleton)').length - continueCards;
  const labels = activeSources().map((source) => source.label);

  let text;
  if (q) {
    text = `Hasil untuk “${q}” — ${plural(total, 'item')} dari ${sourceSummary(labels)}`;
  } else {
    text = `Rekomendasi populer — ${plural(total, 'item')} dari ${sourceSummary(labels)}`;
  }
  if (failed.length) text += ` · gagal: ${sourceSummary(failed.map((source) => source.label))}`;
  els.status.textContent = text;
}

function updateMore() {
  const tabSources = state.sources.filter((source) => source.kind === state.tab);
  const anyNext = tabSources.some((source) => state.hasNext[source.id]);
  els.more.hidden = !(state.tab !== 'semua' && anyNext);
  els.more.disabled = false;
  els.more.textContent = 'Muat lebih banyak';
}

function showNoSources() {
  const kind = state.tab === 'semua' ? 'pencarian' : `tab ${KIND_LABEL[state.tab]}`;
  const note = el('p', { class: 'note', attrs: { role: 'status' } }, [
    el('strong', { text: `Tidak ada sumber aktif untuk ${kind}. ` }),
    document.createTextNode('Aktifkan minimal satu sumber di menu Sumber. '),
    el('button', { class: 'retry', type: 'button', text: 'Buka Sumber' })
  ]);
  note.querySelector('.retry').addEventListener('click', openSettings);
  els.results.replaceChildren(note);
  els.status.textContent = 'Semua sumber untuk tab ini sedang dimatikan.';
  els.more.hidden = true;
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

const TABS = ['semua', 'anime', 'photo', 'video'];

function setTab(tab, { silent = false } = {}) {
  if (!TABS.includes(tab)) return;
  state.tab = tab;
  updateTabUI();
  if (!silent) syncURL();
}

const SORT_OPTIONS = {
  anime: [['popular', 'Terpopuler'], ['score', 'Skor tertinggi'], ['newest', 'Terbaru']],
  photo: [['popular', 'Relevan'], ['newest', 'Terbaru']],
  video: [['popular', 'Terpopuler'], ['newest', 'Terbaru']]
};

function updateSortUI() {
  const options = SORT_OPTIONS[state.tab] || [];
  if (!options.length) {
    els.sortWrap.hidden = true;
    return;
  }
  els.sortWrap.hidden = false;
  if (!options.some(([value]) => value === state.sort)) state.sort = 'popular';
  els.sort.replaceChildren(...options.map(([value, label]) => el('option', { value, text: label })));
  els.sort.value = state.sort;
}

function updateTabUI() {
  for (const tab of els.tabs) {
    const active = tab.dataset.tab === state.tab;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  }
  updateSortUI();
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
    if (TABS.includes(tab)) state.tab = tab;
  } catch {
    state.q = '';
  }
  els.input.value = state.q;
  updateTabUI();
}

/* -------------------------------------------------------------------------- */
/* modal detail                                                                */
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
  els.modalBody.replaceChildren();

  if (item.kind === 'anime') els.modalBody.append(animeModal(item));
  else if (item.kind === 'photo') els.modalBody.append(photoModal(item));
  else els.modalBody.append(videoModal(item));

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
    item.altTitle && item.altTitle !== item.title ? el('p', { class: 'modal-sub', text: item.altTitle }) : null,
    el('p', {
      class: 'modal-sub',
      text: metaLine([
        item.year,
        item.episodes ? `${item.episodes} episode` : null,
        item.duration ? `${item.duration} menit/ep` : null,
        item.score ? `★ ${item.score}/100` : null,
        item.format
      ])
    })
  ]);

  if (item.genres && item.genres.length) {
    info.append(el('div', { class: 'modal-tags' }, item.genres.map((genre) => el('span', { class: 'tag', text: genre }))));
  }

  const head = el('div', { class: 'modal-head' }, [
    item.poster
      ? el('div', { class: 'modal-poster' }, el('img', { src: item.poster, alt: item.title, referrerPolicy: 'no-referrer' }))
      : null,
    info
  ]);
  if (!item.banner) head.style.marginTop = '20px';

  const wrap = el('div', { class: 'modal-inner' }, [head]);

  if (item.description) wrap.append(el('p', { class: 'modal-desc', text: item.description }));

  wrap.append(el('div', { class: 'modal-actions' }, [actionLink(item.sourceUrl || item.pageUrl, 'Buka di AniList', true)]));
  wrap.append(progressBox(item));

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

  const fragment = document.createDocumentFragment();
  fragment.append(hero, wrap);
  return fragment;
}

function photoModal(item) {
  const wrap = el('div', { class: 'modal-inner' }, [
    el('h2', { class: 'modal-title', id: 'modal-title', text: item.title }),
    el('p', { class: 'modal-sub', text: metaLine([item.source, item.artist, item.license]) })
  ]);

  if (item.full || item.thumb) {
    const image = el('img', {
      src: item.full || item.thumb,
      alt: item.title,
      loading: 'lazy',
      referrerPolicy: 'no-referrer'
    });
    image.addEventListener('error', () => {
      if (item.thumb && image.src !== item.thumb) image.src = item.thumb;
    });
    wrap.append(el('figure', { class: 'modal-photo' }, image));
  }
  if (item.description) wrap.append(el('p', { class: 'modal-desc', text: item.description }));
  wrap.append(
    el('div', { class: 'modal-actions' }, [actionLink(item.pageUrl, 'Buka halaman sumber', true)]),
    el('p', { class: 'modal-credit', text: 'Lisensi & atribusi lengkap tersedia di halaman sumber.' })
  );
  return wrap;
}

function guessEmbed(url) {
  try {
    const parsed = new URL(url, location.href);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id = parsed.searchParams.get('v');
      if (id) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
      const match = parsed.pathname.match(/\/embed\/([\w-]+)/);
      if (match) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(match[1])}`;
    }
    if (host === 'youtu.be') {
      return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(parsed.pathname.slice(1))}`;
    }
    if (host.endsWith('dailymotion.com')) {
      const id = parsed.pathname.split('/').filter(Boolean).pop();
      if (id) return `https://www.dailymotion.com/embed/video/${encodeURIComponent(id)}`;
    }
    if (host.endsWith('vimeo.com')) {
      const id = parsed.pathname.split('/').filter(Boolean).pop();
      if (id) return `https://player.vimeo.com/video/${encodeURIComponent(id)}`;
    }
  } catch {
    /* URL tidak valid untuk embed */
  }
  return null;
}

function videoModal(item) {
  const wrap = el('div', { class: 'modal-inner' }, [
    el('h2', { class: 'modal-title', id: 'modal-title', text: item.title }),
    el('p', { class: 'modal-sub', text: metaLine([item.source, item.year, item.creator]) })
  ]);

  let embedUrl = item.embedUrl || null;
  if (!embedUrl && item.pageUrl && !(item.mime && item.mime.startsWith('video/'))) {
    embedUrl = guessEmbed(item.pageUrl);
  }

  if (item.mime && item.full && item.mime.startsWith('video/')) {
    wrap.append(
      el('div', { class: 'modal-media' },
        el('video', { src: item.full, poster: item.thumb, controls: true, preload: 'metadata' })
      )
    );
  } else if (embedUrl) {
    wrap.append(
      el('div', { class: 'modal-media' },
        el('iframe', {
          src: embedUrl,
          title: item.title,
          loading: 'lazy',
          allow: 'fullscreen; picture-in-picture',
          allowfullscreen: true
        })
      )
    );
  }

  if (item.description) wrap.append(el('p', { class: 'modal-desc', text: item.description }));
  wrap.append(
    el('div', { class: 'modal-actions' }, [actionLink(item.pageUrl, 'Buka halaman sumber', true)]),
    el('p', { class: 'modal-credit', text: 'Video diputar langsung dari penyedia aslinya. Hak cipta milik pembuat masing-masing.' })
  );
  return wrap;
}

/* -------------------------------------------------------------------------- */
/* settings modal                                                              */
/* -------------------------------------------------------------------------- */

let settingsLastFocus = null;

function openSettings() {
  settingsLastFocus = document.activeElement;
  renderSettings();
  els.settings.hidden = false;
  document.body.classList.add('is-locked');
  els.settingsClose.focus();
}

function closeSettings() {
  if (els.settings.hidden) return;
  els.settings.hidden = true;
  document.body.classList.remove('is-locked');
  if (settingsLastFocus && typeof settingsLastFocus.focus === 'function') settingsLastFocus.focus();
  settingsLastFocus = null;
}

function renderSettings() {
  if (els.clickDetail && els.clickSource) {
    els.clickDetail.checked = state.clickMode === 'detail';
    els.clickSource.checked = state.clickMode === 'source';
  }
  updateSettingsProgressCount();

  els.sourceList.replaceChildren();

  const groups = ['Anime', 'Foto', 'Video', 'Wikimedia Commons', 'Internet Archive', 'PeerTube'];
  for (const group of groups) {
    const sources = ALL_SOURCES.filter((source) => source.group === group);
    if (!sources.length) continue;

    const section = el('section', { class: 'source-group', dataset: { group } });
    const count = el('span', { class: 'source-count source-note', text: '' });
    const toggle = el('button', { class: 'btn btn-small group-toggle', type: 'button', text: 'Aktifkan semua' });
    toggle.addEventListener('click', () => {
      const allOn = sources.every((source) => state.enabled.has(source.id));
      setGroupEnabled(section, sources, !allOn);
    });

    section.append(
      el('div', { class: 'source-group-head' }, [
        el('h3', { class: 'settings-sub', text: group }),
        count,
        toggle
      ])
    );

    for (const source of sources) {
      const checkbox = el('input', { type: 'checkbox', checked: state.enabled.has(source.id) });
      const row = el('label', {
        class: 'source-row',
        dataset: { search: `${source.label} ${source.note || ''}`.toLowerCase() }
      }, [
        checkbox,
        el('span', { class: 'source-name', text: source.label }),
        el('span', { class: 'source-note', text: source.note || '' })
      ]);
      checkbox.addEventListener('change', () => {
        setSourceEnabled(source.id, checkbox.checked);
        updateGroupSummary(section, sources);
        updateSourceTotal();
      });
      section.append(row);
    }

    updateGroupSummary(section, sources);
    els.sourceList.append(section);
  }

  updateSourceTotal();
  applySourceFilter();

  els.customList.replaceChildren();
  if (!state.customConfigs.length) {
    els.customList.append(el('p', { class: 'hint', text: 'Belum ada sumber kustom.' }));
  } else {
    for (const config of state.customConfigs) {
      const remove = el('button', { class: 'btn btn-small', type: 'button', text: 'Hapus' });
      remove.addEventListener('click', () => removeCustom(config.id));
      els.customList.append(
        el('div', { class: 'custom-row' }, [
          el('div', { class: 'custom-info' }, [
            el('strong', { text: config.name }),
            el('span', { class: 'source-note', text: `${KIND_LABEL[config.kind]} · ${config.url}` })
          ]),
          remove
        ])
      );
    }
  }
}

function setSourceEnabled(id, enabled) {
  if (enabled) state.enabled.add(id);
  else state.enabled.delete(id);
  persistSources();
  buildSources();
  performSearch();
}

function setGroupEnabled(section, sources, enabled) {
  for (const source of sources) {
    if (enabled) state.enabled.add(source.id);
    else state.enabled.delete(source.id);
  }
  persistSources();
  buildSources();

  const inputs = section.querySelectorAll('.source-row input[type="checkbox"]');
  inputs.forEach((checkbox, index) => {
    checkbox.checked = state.enabled.has(sources[index].id);
  });
  updateGroupSummary(section, sources);
  updateSourceTotal();
  performSearch();
}

function updateGroupSummary(section, sources) {
  const enabled = sources.filter((source) => state.enabled.has(source.id)).length;
  const count = section.querySelector('.source-count');
  if (count) count.textContent = `${enabled}/${sources.length} aktif`;
  const toggle = section.querySelector('.group-toggle');
  if (toggle) toggle.textContent = enabled === sources.length ? 'Matikan semua' : 'Aktifkan semua';
}

function updateSourceTotal() {
  if (!els.sourceTotal) return;
  const active = ALL_SOURCES.filter((source) => state.enabled.has(source.id)).length;
  els.sourceTotal.textContent = `${active} aktif dari ${ALL_SOURCES.length} sumber bawaan` +
    (active > 12 ? ' · makin banyak makin lambat' : '');
}

function applySourceFilter() {
  if (!els.sourceFilter) return;
  const term = els.sourceFilter.value.trim().toLowerCase();
  for (const section of els.sourceList.querySelectorAll('.source-group')) {
    let visible = 0;
    for (const row of section.querySelectorAll('.source-row')) {
      const match = !term || (row.dataset.search || '').includes(term);
      row.hidden = !match;
      if (match) visible += 1;
    }
    const head = section.querySelector('.source-group-head');
    if (head) head.hidden = visible === 0;
    section.hidden = visible === 0;
  }
}

function persistSources() {
  saveJSON(STORE.enabled, [...state.enabled]);
  saveJSON(STORE.custom, state.customConfigs);
}

function removeCustom(id) {
  state.customConfigs = state.customConfigs.filter((config) => config.id !== id);
  persistSources();
  buildSources();
  renderSettings();
  performSearch();
}

function readCustomForm() {
  const name = els.cfName.value.trim();
  const kind = els.cfKind.value === 'video' ? 'video' : 'photo';
  const url = els.cfUrl.value.trim();

  if (!name) throw new Error('Nama sumber wajib diisi.');
  if (!/^https?:\/\//i.test(url)) throw new Error('URL harus diawali http:// atau https://.');

  let headers;
  const rawHeaders = els.cfHeaders.value.trim();
  if (rawHeaders) {
    try {
      headers = JSON.parse(rawHeaders);
    } catch {
      throw new Error('Header JSON tidak valid.');
    }
    if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
      throw new Error('Header harus berupa objek JSON.');
    }
  }

  return {
    id: `custom-${Date.now()}`,
    name,
    kind,
    url,
    headers,
    itemsPath: els.cfItems.value.trim() || 'items',
    titlePath: els.cfTitle.value.trim() || 'title',
    thumbPath: els.cfThumb.value.trim(),
    linkPath: els.cfLink.value.trim(),
    descriptionPath: els.cfDesc.value.trim()
  };
}

els.customForm.addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    const config = readCustomForm();
    state.customConfigs = [...state.customConfigs, config];
    persistSources();
    buildSources();
    renderSettings();

    els.cfName.value = '';
    els.cfHeaders.value = '';
    els.customStatus.textContent = `Sumber "${config.name}" ditambahkan.`;
    performSearch();
  } catch (error) {
    els.customStatus.textContent = error.message;
  }
});

els.cfTest.addEventListener('click', async () => {
  els.cfTest.disabled = true;
  els.customStatus.textContent = 'Menguji sumber…';
  try {
    const config = readCustomForm();
    const tester = createCustomSource({ ...config, id: 'test' });
    const result = await tester.search(state.q.trim() || 'anime', 1);
    const sample = result.items[0];
    els.customStatus.textContent = result.items.length
      ? `${result.items.length} item ditemukan. Contoh: ${sample ? sample.title : '-'}`
      : 'Terhubung, tetapi tidak ada item. Periksa path JSON.';
  } catch (error) {
    els.customStatus.textContent = `Gagal: ${error.message}`;
  } finally {
    els.cfTest.disabled = false;
  }
});

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

els.sort.addEventListener('change', () => {
  state.sort = els.sort.value;
  saveJSON(STORE.sort, state.sort);
  performSearch();
});

for (const radio of [els.clickDetail, els.clickSource]) {
  if (!radio) continue;
  radio.addEventListener('change', () => {
    if (!radio.checked) return;
    state.clickMode = radio.value;
    saveJSON(STORE.click, state.clickMode);
  });
}

if (els.clearProgress) {
  els.clearProgress.addEventListener('click', () => {
    state.progress = {};
    persistProgress();
    document.querySelectorAll('.progress-flag, .card-progress').forEach((node) => node.remove());
    updateSettingsProgressCount();
    performSearch();
  });
}

els.more.addEventListener('click', () => {
  if (state.loading) return;
  performSearch({ append: true });
});

els.sourcesBtn.addEventListener('click', (event) => {
  event.preventDefault();
  openSettings();
});
const aboutSources = document.getElementById('about-sources');
if (aboutSources) aboutSources.addEventListener('click', openSettings);
if (els.sourceFilter) els.sourceFilter.addEventListener('input', applySourceFilter);

els.modal.addEventListener('click', (event) => {
  if (event.target.closest('[data-close]')) closeModal();
});

els.settings.addEventListener('click', (event) => {
  if (event.target.closest('[data-settings-close]')) closeSettings();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!els.settings.hidden) closeSettings();
    else if (!els.modal.hidden) closeModal();
  }

  if (event.key === '/' && els.modal.hidden && els.settings.hidden) {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    event.preventDefault();
    els.input.focus();
  }

  if (event.key === 'Tab') {
    const scope = !els.settings.hidden ? els.settings : (!els.modal.hidden ? els.modal : null);
    if (!scope) return;
    const focusables = Array.from(
      scope.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, video, [tabindex="0"]')
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
buildSources();
readURL();
performSearch();
