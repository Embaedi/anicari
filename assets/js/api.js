/**
 * AniCari data layer.
 * Setiap sumber punya bentuk objek hasil yang sama:
 *
 *   { kind, id, title, thumb, full?, pageUrl?, embedUrl?, description?, ... }
 *
 * Sumber bawaan memakai API publik tanpa kunci. Sumber kustom dibuat pengguna
 * lewat pengaturan dan disimpan di localStorage.
 */

const ANILIST_URL = 'https://graphql.anilist.co';
const COMMONS_URL = 'https://commons.wikimedia.org/w/api.php';
const ARCHIVE_URL = 'https://archive.org/advancedsearch.php';
const NASA_URL = 'https://images-api.nasa.gov/search';
const OPENVERSE_URL = 'https://api.openverse.org/v1/images/';
const DAILYMOTION_URL = 'https://api.dailymotion.com/videos';

const COMMONS_LIMIT = 24;
const ARCHIVE_LIMIT = 18;
const NASA_PAGE_SIZE = 20;
const OPENVERSE_PAGE_SIZE = 20;
const DAILYMOTION_LIMIT = 18;

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

const HOST_LIMIT = 4;
const hostActive = new Map();
const hostQueue = new Map();

function acquireHost(host) {
  const active = hostActive.get(host) || 0;
  if (active < HOST_LIMIT) {
    hostActive.set(host, active + 1);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const queue = hostQueue.get(host) || [];
    queue.push(resolve);
    hostQueue.set(host, queue);
  });
}

function releaseHost(host) {
  const queue = hostQueue.get(host);
  if (queue && queue.length) {
    const next = queue.shift();
    next();
    return;
  }
  hostActive.set(host, Math.max(0, (hostActive.get(host) || 1) - 1));
}

async function getJSON(url, options = {}, timeoutMs = 15000) {
  let host = '';
  try { host = new URL(url).host; } catch { host = ''; }
  if (host) await acquireHost(host);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
    if (host) releaseHost(host);
  }
}

/** Ubah potongan HTML/teks dari API menjadi teks biasa yang aman ditampilkan. */
export function plainText(input = '') {
  if (!input) return '';
  return String(input)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text, max = 180) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function cleanSearchTerm(value) {
  return String(value || '').trim().replace(/["\\<>]/g, '').slice(0, 120);
}

/** Ambil nilai bersarang: "collection.items", "data.0.title". */
export function getPath(object, path) {
  if (!path) return undefined;
  return String(path).split('.').reduce((current, key) => (current == null ? current : current[key]), object);
}

function safeHeaders(headers) {
  if (!headers || typeof headers !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof key === 'string' && typeof value === 'string' && key.length < 100) out[key] = value;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Anime — AniList                                                             */
/* -------------------------------------------------------------------------- */

const ANIME_FIELDS = `
  id
  title { romaji english native }
  coverImage { large extraLarge color }
  bannerImage
  description(asHtml: false)
  averageScore
  episodes
  duration
  seasonYear
  format
  status
  genres
  trailer { id site }
  siteUrl
`;

function mapAnime(media) {
  const title = media.title || {};
  const cover = media.coverImage || {};
  const trailer = media.trailer && media.trailer.site === 'youtube' ? media.trailer.id : null;
  return {
    kind: 'anime',
    id: `anime-${media.id}`,
    source: 'AniList',
    sourceUrl: media.siteUrl || `https://anilist.co/anime/${media.id}`,
    title: title.romaji || title.english || title.native || 'Tanpa judul',
    altTitle: title.english || title.native || '',
    poster: cover.extraLarge || cover.large || '',
    banner: media.bannerImage || '',
    color: cover.color || '#10131c',
    year: media.seasonYear || null,
    episodes: media.episodes || null,
    duration: media.duration || null,
    score: media.averageScore || null,
    format: media.format ? media.format.replaceAll('_', ' ') : '',
    status: media.status ? media.status.replaceAll('_', ' ') : '',
    genres: Array.isArray(media.genres) ? media.genres.slice(0, 4) : [],
    description: plainText(media.description),
    trailer
  };
}

const ANIME_SORTS = {
  popular: 'POPULARITY_DESC',
  score: 'SCORE_DESC',
  newest: 'START_DATE_DESC',
  trending: 'TRENDING_DESC'
};

async function searchAnime(query, page = 1, perPage = 18, sort = 'popular') {
  const term = cleanSearchTerm(query);
  const hasTerm = term.length > 0;
  const anilistSort = ANIME_SORTS[sort] || ANIME_SORTS.popular;

  const gql = hasTerm
    ? `query ($search: String, $page: Int, $perPage: Int, $sort: [MediaSort]) {
        Page(page: $page, perPage: $perPage) {
          pageInfo { hasNextPage }
          media(search: $search, type: ANIME, sort: $sort) { ${ANIME_FIELDS} }
        }
      }`
    : `query ($page: Int, $perPage: Int, $sort: [MediaSort]) {
        Page(page: $page, perPage: $perPage) {
          pageInfo { hasNextPage }
          media(type: ANIME, sort: $sort) { ${ANIME_FIELDS} }
        }
      }`;

  const variables = hasTerm
    ? { search: term, page, perPage, sort: [anilistSort] }
    : { page, perPage, sort: [anilistSort] };
  const json = await getJSON(
    ANILIST_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: gql, variables })
    },
    15000
  );

  if (Array.isArray(json.errors) && json.errors.length) {
    throw new Error(json.errors[0].message || 'AniList menolak permintaan.');
  }

  const pageData = json.data && json.data.Page;
  const items = ((pageData && pageData.media) || [])
    .filter(Boolean)
    .map(mapAnime)
    .filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index);

  return { items, hasNext: Boolean(pageData && pageData.pageInfo && pageData.pageInfo.hasNextPage) };
}

/* -------------------------------------------------------------------------- */
/* Foto & video — Wikimedia Commons                                            */
/* -------------------------------------------------------------------------- */

function mapCommons(page) {
  const info = (page.imageinfo && page.imageinfo[0]) || {};
  const meta = info.extmetadata || {};
  const mime = info.mime || '';
  const kind = mime.startsWith('video/') ? 'video' : 'photo';
  const fileTitle = String(page.title || '')
    .replace(/^File:/, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/_/g, ' ');

  const thumb = info.thumburl || info.url || '';

  return {
    kind,
    id: `commons-${page.pageid}`,
    source: 'Wikimedia Commons',
    title: fileTitle,
    thumb,
    full: kind === 'photo' ? thumb : (info.url || thumb),
    pageUrl: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title || '')}`,
    mime,
    artist: truncate(plainText(meta.Artist && meta.Artist.value), 70),
    license: truncate(plainText(meta.LicenseShortName && meta.LicenseShortName.value), 40),
    description: truncate(plainText(meta.ImageDescription && meta.ImageDescription.value), 220),
    year: meta.DateTimeOriginal ? String(plainText(meta.DateTimeOriginal.value)).slice(0, 10) : ''
  };
}

async function commonsSearch(search, page, kind, sort) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: search,
    gsrnamespace: '6',
    gsrlimit: String(COMMONS_LIMIT),
    gsroffset: String((page - 1) * COMMONS_LIMIT),
    prop: 'imageinfo',
    iiprop: 'url|mime|size|extmetadata',
    iiurlwidth: '480'
  });
  if (sort === 'newest') params.set('gsrsort', 'create_timestamp_desc');

  const json = await getJSON(`${COMMONS_URL}?${params.toString()}`, {}, 15000);
  const pages = (json.query && json.query.pages) || {};

  const items = Object.values(pages)
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .map(mapCommons)
    .filter((item) => (kind === 'video' ? item.kind === 'video' : item.kind === 'photo'));

  return { items, hasNext: Boolean(json.continue && json.continue.gsroffset) };
}

async function searchCommons(query, page = 1, kind = 'photo', sort = 'popular') {
  const term = cleanSearchTerm(query);
  const filetype = kind === 'video' ? 'video' : 'bitmap';
  const search = term
    ? `${term} filetype:${filetype}`
    : `${kind === 'video' ? 'documentary' : 'incategory:"Featured pictures on Wikimedia Commons"'} filetype:${filetype}`;
  return commonsSearch(search, page, kind, sort);
}

async function searchCommonsChannel(channel, query, page = 1, sort = 'popular') {
  const term = cleanSearchTerm(query);
  const parts = [];
  if (term) parts.push(term);
  if (channel.category) parts.push(`incategory:"${channel.category}"`);
  if (channel.term) parts.push(channel.term);
  parts.push(`filetype:${channel.kind === 'video' ? 'video' : 'bitmap'}`);
  return commonsSearch(parts.join(' '), page, channel.kind, sort);
}

/* -------------------------------------------------------------------------- */
/* Foto — NASA Image Library                                                   */
/* -------------------------------------------------------------------------- */

async function searchNasaImages(query, page = 1, sort = 'popular') {
  const term = cleanSearchTerm(query) || 'earth';
  const params = new URLSearchParams({
    q: term,
    media_type: 'image',
    page: String(page),
    page_size: String(NASA_PAGE_SIZE)
  });

  const json = await getJSON(`${NASA_URL}?${params.toString()}`, {}, 15000);
  const collection = json.collection || {};
  const total = (collection.metadata && collection.metadata.total_hits) || 0;

  const items = (collection.items || [])
    .map((entry) => {
      const data = (entry.data && entry.data[0]) || {};
      const nasaId = data.nasa_id;
      if (!nasaId) return null;
      const thumb = (entry.links && entry.links[0] && entry.links[0].href)
        || `https://images-assets.nasa.gov/image/${nasaId}/${nasaId}~thumb.jpg`;
      return {
        kind: 'photo',
        id: `nasa-${nasaId}`,
        source: 'NASA',
        title: plainText(data.title) || nasaId,
        thumb,
        full: thumb.replace(/~(thumb|medium|small)\.jpg$/i, '~large.jpg'),
        pageUrl: `https://images.nasa.gov/details-${encodeURIComponent(nasaId)}`,
        license: 'Public domain',
        artist: data.center || 'NASA',
        description: truncate(plainText(data.description), 220),
        year: data.date_created ? String(data.date_created).slice(0, 4) : '',
        date: data.date_created || ''
      };
    })
    .filter(Boolean);

  if (sort === 'newest') items.sort((a, b) => String(b.date).localeCompare(String(a.date)));

  return { items, hasNext: page * NASA_PAGE_SIZE < total };
}

/* -------------------------------------------------------------------------- */
/* Foto — Openverse (opsional, bisa dinonaktifkan karena kadang lambat)        */
/* -------------------------------------------------------------------------- */

async function searchOpenverse(query, page = 1) {
  const term = cleanSearchTerm(query) || 'nature';
  const params = new URLSearchParams({
    q: term,
    page: String(page),
    page_size: String(OPENVERSE_PAGE_SIZE)
  });

  const json = await getJSON(`${OPENVERSE_URL}?${params.toString()}`, {}, 20000);
  const results = Array.isArray(json.results) ? json.results : [];

  const items = results.map((row) => ({
    kind: 'photo',
    id: `openverse-${row.id}`,
    source: 'Openverse',
    title: plainText(row.title) || 'Tanpa judul',
    thumb: row.thumbnail || row.url || '',
    full: row.url || row.thumbnail || '',
    pageUrl: row.foreign_landing_url || row.url || '',
    artist: truncate(plainText(row.creator), 70),
    license: truncate(`${row.license || ''} ${row.license_version || ''}`.trim(), 40),
    description: ''
  }));

  return { items, hasNext: Number(json.page || page) < Number(json.page_count || 0) };
}

/* -------------------------------------------------------------------------- */
/* Video — Internet Archive                                                    */
/* -------------------------------------------------------------------------- */

function escapeArchiveTerm(value) {
  return String(value).replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, ' ');
}

function mapArchive(doc) {
  const identifier = doc.identifier;
  const title = Array.isArray(doc.title) ? doc.title[0] : doc.title;
  const creator = Array.isArray(doc.creator) ? doc.creator[0] : doc.creator;
  const description = Array.isArray(doc.description) ? doc.description.join(' ') : doc.description;

  return {
    kind: 'video',
    id: `archive-${identifier}`,
    source: 'Internet Archive',
    identifier,
    title: plainText(title) || identifier,
    thumb: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
    embedUrl: `https://archive.org/embed/${encodeURIComponent(identifier)}`,
    pageUrl: `https://archive.org/details/${encodeURIComponent(identifier)}`,
    year: doc.year || '',
    creator: truncate(plainText(creator), 70),
    description: truncate(plainText(description), 220),
    downloads: doc.downloads || 0
  };
}

function mapArchivePhoto(doc) {
  const identifier = doc.identifier;
  const title = Array.isArray(doc.title) ? doc.title[0] : doc.title;
  const creator = Array.isArray(doc.creator) ? doc.creator[0] : doc.creator;
  const description = Array.isArray(doc.description) ? doc.description.join(' ') : doc.description;

  return {
    kind: 'photo',
    id: `archive-img-${identifier}`,
    source: 'Internet Archive',
    identifier,
    title: plainText(title) || identifier,
    thumb: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
    full: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
    pageUrl: `https://archive.org/details/${encodeURIComponent(identifier)}`,
    year: doc.year || '',
    creator: truncate(plainText(creator), 70),
    description: truncate(plainText(description), 220)
  };
}

async function archiveSearch(search, page, sort, kind = 'video') {
  const rows = ARCHIVE_LIMIT;
  const start = (page - 1) * rows;

  const params = new URLSearchParams({ q: search, output: 'json' });
  params.set('rows', String(rows));
  params.set('page', String(page));
  params.append('fl[]', 'identifier');
  params.append('fl[]', 'title');
  params.append('fl[]', 'description');
  params.append('fl[]', 'year');
  params.append('fl[]', 'creator');
  params.append('fl[]', 'downloads');
  params.append('fl[]', 'mediatype');
  params.append('sort[]', sort === 'newest' ? 'addeddate desc' : 'downloads desc');

  const json = await getJSON(`${ARCHIVE_URL}?${params.toString()}`, {}, 20000);
  const response = (json && json.response) || {};
  const docs = response.docs || [];
  const items = docs.map(kind === 'photo' ? mapArchivePhoto : mapArchive);

  return {
    items,
    hasNext: start + docs.length < (response.numFound || 0),
    total: response.numFound || 0
  };
}

async function searchVideos(query, page = 1, sort = 'popular') {
  const term = cleanSearchTerm(query);
  const search = term
    ? `mediatype:movies AND (title:(${escapeArchiveTerm(term)}) OR description:(${escapeArchiveTerm(term)}))`
    : 'mediatype:movies AND collection:feature_films';
  return archiveSearch(search, page, sort, 'video');
}

async function searchArchiveChannel(channel, query, page = 1, sort = 'popular') {
  const term = cleanSearchTerm(query);
  let search = `mediatype:${channel.kind === 'photo' ? 'image' : 'movies'} AND (${channel.query})`;
  if (term) {
    search += ` AND (title:(${escapeArchiveTerm(term)}) OR description:(${escapeArchiveTerm(term)}))`;
  }
  const result = await archiveSearch(search, page, sort, channel.kind || 'video');
  return { ...result, items: result.items.map((item) => ({ ...item, source: channel.label })) };
}

/* -------------------------------------------------------------------------- */
/* Video — Dailymotion                                                         */
/* -------------------------------------------------------------------------- */

async function searchDailymotion(query, page = 1, sort = 'popular') {
  const term = cleanSearchTerm(query) || 'documentary';
  const params = new URLSearchParams({
    search: term,
    fields: 'id,title,thumbnail_480_url,url,duration,owner.screenname,created_time',
    limit: String(DAILYMOTION_LIMIT),
    page: String(page),
    family_filter: 'true',
    sort: sort === 'newest' ? 'recent' : 'visited'
  });

  const json = await getJSON(`${DAILYMOTION_URL}?${params.toString()}`, {}, 15000);
  const list = Array.isArray(json.list) ? json.list : [];

  const items = list.map((row) => ({
    kind: 'video',
    id: `dailymotion-${row.id}`,
    source: 'Dailymotion',
    title: plainText(row.title) || 'Tanpa judul',
    thumb: row.thumbnail_480_url || '',
    embedUrl: `https://www.dailymotion.com/embed/video/${encodeURIComponent(row.id)}`,
    pageUrl: row.url || `https://www.dailymotion.com/video/${row.id}`,
    creator: truncate(plainText(row['owner.screenname']), 70),
    year: row.created_time ? new Date(row.created_time * 1000).getFullYear() : '',
    description: ''
  }));

  return { items, hasNext: Boolean(json.has_more) };
}

/* -------------------------------------------------------------------------- */
/* Sumber kustom (ditambahkan pengguna lewat pengaturan)                       */
/* -------------------------------------------------------------------------- */

/**
 * @param {object} config
 * @param {string} config.name
 * @param {'photo'|'video'} config.kind
 * @param {string} config.url  template dengan placeholder {q} {page} {pageSize}
 * @param {object} [config.headers]
 * @param {string} config.itemsPath
 * @param {string} config.titlePath
 * @param {string} [config.thumbPath]
 * @param {string} [config.linkPath]
 * @param {string} [config.descriptionPath]
 */
export function createCustomSource(config) {
  return {
    id: config.id,
    kind: config.kind === 'video' ? 'video' : 'photo',
    label: config.name,
    note: 'Sumber kustom',
    custom: true,
    config,
    search: (query, page = 1) => searchCustom(config, query, page)
  };
}

async function searchCustom(config, query, page = 1) {
  const term = cleanSearchTerm(query);
  const pageSize = Number(config.pageSize) || 20;

  const url = String(config.url)
    .replaceAll('{q}', encodeURIComponent(term))
    .replaceAll('{page}', String(page))
    .replaceAll('{pageSize}', String(pageSize));

  if (!/^https?:\/\//i.test(url)) throw new Error('URL sumber harus http(s).');

  const json = await getJSON(url, { headers: safeHeaders(config.headers) }, 15000);
  const raw = getPath(json, config.itemsPath || 'items');
  if (!Array.isArray(raw)) {
    throw new Error(`Path "${config.itemsPath || 'items'}" bukan array.`);
  }

  const items = raw
    .slice(0, 40)
    .map((row, index) => {
      const thumb = getPath(row, config.thumbPath);
      const link = getPath(row, config.linkPath);
      const title = getPath(row, config.titlePath);
      const description = getPath(row, config.descriptionPath);
      const id = getPath(row, config.idPath);
      return {
        kind: config.kind === 'video' ? 'video' : 'photo',
        id: `${config.id}-${id || index}`,
        source: config.name,
        title: plainText(String(title || '')) || 'Tanpa judul',
        thumb: typeof thumb === 'string' ? thumb : '',
        full: typeof thumb === 'string' ? thumb : '',
        pageUrl: typeof link === 'string' ? link : url,
        description: truncate(plainText(String(description || '')), 220),
        custom: true
      };
    });

  return {
    items,
    hasNext: config.url.includes('{page}') && items.length > 0
  };
}

/* -------------------------------------------------------------------------- */
/* Registry sumber bawaan                                                      */
/* -------------------------------------------------------------------------- */

export const BUILTIN_SOURCES = [
  {
    id: 'anilist',
    kind: 'anime',
    label: 'AniList',
    note: 'Database anime, skor, dan trailer.',
    defaultEnabled: true,
    search: (query, page, sort) => searchAnime(query, page, 18, sort)
  },
  {
    id: 'commons',
    kind: 'photo',
    label: 'Wikimedia Commons',
    note: 'Foto bebas lisensi dari seluruh dunia.',
    defaultEnabled: true,
    search: (query, page, sort) => searchCommons(query, page, 'photo', sort)
  },
  {
    id: 'nasa',
    kind: 'photo',
    label: 'NASA Image Library',
    note: 'Foto antariksa, Bumi, dan misi NASA. Aktifkan bila jaringanmu mendukung.',
    defaultEnabled: false,
    search: searchNasaImages
  },
  {
    id: 'openverse',
    kind: 'photo',
    label: 'Openverse',
    note: 'Gambar CC dari Flickr, museum, dan lainnya. Kadang lambat.',
    defaultEnabled: false,
    search: (query, page) => searchOpenverse(query, page)
  },
  {
    id: 'archive',
    kind: 'video',
    label: 'Internet Archive',
    note: 'Film klasik dan dokumenter domain publik.',
    defaultEnabled: true,
    search: searchVideos
  },
  {
    id: 'commons-video',
    kind: 'video',
    label: 'Wikimedia Commons Video',
    note: 'Video dokumenter dan edukasi bebas lisensi.',
    defaultEnabled: true,
    search: (query, page, sort) => searchCommons(query, page, 'video', sort)
  },
  {
    id: 'dailymotion',
    kind: 'video',
    label: 'Dailymotion',
    note: 'Video komunitas; hanya untuk pratinjau. Aktifkan bila jaringanmu mendukung.',
    defaultEnabled: false,
    search: searchDailymotion
  }
];

/* -------------------------------------------------------------------------- */
/* Sumber tambahan — API publik lain                                           */
/* -------------------------------------------------------------------------- */

async function searchJikan(query, page = 1, sort = 'popular') {
  const term = cleanSearchTerm(query);
  const order = sort === 'score' ? 'score' : sort === 'newest' ? 'start_date' : 'popularity';
  const direction = sort === 'score' ? 'desc' : sort === 'newest' ? 'desc' : 'asc';

  const params = new URLSearchParams({ limit: '18', page: String(page), order_by: order, sort: direction, sfw: 'true' });
  if (term) params.set('q', term);

  const url = term
    ? `https://api.jikan.moe/v4/anime?${params}`
    : `https://api.jikan.moe/v4/top/anime?${params}`;
  const json = await getJSON(url, {}, 15000);

  const items = (json.data || []).map((row) => ({
    kind: 'anime',
    id: `jikan-${row.mal_id}`,
    source: 'MyAnimeList (Jikan)',
    sourceUrl: row.url || `https://myanimelist.net/anime/${row.mal_id}`,
    title: row.title_english || row.title || 'Tanpa judul',
    altTitle: row.title_japanese || '',
    poster: (row.images && row.images.jpg && (row.images.jpg.large_image_url || row.images.jpg.image_url)) || '',
    banner: '',
    color: '#1a1f2e',
    year: row.year || null,
    episodes: row.episodes || null,
    duration: row.duration ? null : null,
    score: row.score ? Math.round(row.score * 10) : null,
    format: row.type || '',
    status: row.status || '',
    genres: (row.genres || []).slice(0, 4).map((g) => g.name),
    description: plainText(row.synopsis),
    trailer: row.trailer && row.trailer.youtube_id ? row.trailer.youtube_id : null
  }));

  return { items, hasNext: Boolean(json.pagination && json.pagination.has_next_page) };
}

async function searchKitsu(query, page = 1, sort = 'popular') {
  const term = cleanSearchTerm(query);
  const sortMap = { popular: '-userCount', score: '-averageRating', newest: '-startDate' };
  const params = new URLSearchParams({
    'page[limit]': '18',
    'page[offset]': String((page - 1) * 18),
    sort: sortMap[sort] || sortMap.popular
  });
  if (term) params.set('filter[text]', term);

  const json = await getJSON(`https://kitsu.io/api/edge/anime?${params}`, { headers: { Accept: 'application/vnd.api+json' } }, 15000);
  const items = (json.data || []).map((row) => {
    const a = row.attributes || {};
    const poster = a.posterImage || {};
    return {
      kind: 'anime',
      id: `kitsu-${row.id}`,
      source: 'Kitsu',
      sourceUrl: `https://kitsu.io/anime/${a.slug || row.id}`,
      title: a.canonicalTitle || (a.titles && (a.titles.en || a.titles.en_jp)) || 'Tanpa judul',
      altTitle: a.titles ? (a.titles.ja_jp || '') : '',
      poster: poster.large || poster.medium || poster.original || '',
      banner: (a.coverImage && a.coverImage.large) || '',
      color: '#1a1f2e',
      year: a.startDate ? Number(String(a.startDate).slice(0, 4)) : null,
      episodes: a.episodeCount || null,
      duration: null,
      score: a.averageRating ? Math.round(Number(a.averageRating)) : null,
      format: a.subtype ? String(a.subtype).toUpperCase() : '',
      status: a.status ? String(a.status).toUpperCase() : '',
      genres: [],
      description: plainText(a.synopsis),
      trailer: a.youtubeVideoId || null
    };
  });

  return { items, hasNext: Boolean(json.links && json.links.next) };
}

async function searchTvmaze(query, page = 1) {
  const term = cleanSearchTerm(query);
  if (!term) return { items: [], hasNext: false };

  const json = await getJSON(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(term)}`, {}, 15000);
  const items = (Array.isArray(json) ? json : []).map(({ show }) => ({
    kind: 'photo',
    id: `tvmaze-${show.id}`,
    source: 'TVmaze',
    title: show.name || 'Tanpa judul',
    thumb: (show.image && (show.image.original || show.image.medium)) || '',
    full: (show.image && show.image.original) || (show.image && show.image.medium) || '',
    pageUrl: show.url || `https://www.tvmaze.com/shows/${show.id}`,
    artist: show.network ? show.network.name : '',
    license: show.type || '',
    description: truncate(plainText(show.summary), 220),
    year: show.premiered ? String(show.premiered).slice(0, 4) : '',
    genres: show.genres || []
  }));

  return { items, hasNext: false };
}

async function searchOpenLibrary(query, page = 1) {
  const term = cleanSearchTerm(query);
  if (!term) return { items: [], hasNext: false };

  const params = new URLSearchParams({
    q: term,
    page: String(page),
    limit: '20',
    fields: 'key,title,author_name,first_publish_year,cover_i'
  });
  const json = await getJSON(`https://openlibrary.org/search.json?${params}`, {}, 15000);
  const docs = json.docs || [];

  const items = docs
    .filter((row) => row.cover_i)
    .map((row) => ({
      kind: 'photo',
      id: `openlibrary-${row.key}`,
      source: 'Open Library',
      title: row.title || 'Tanpa judul',
      thumb: `https://covers.openlibrary.org/b/id/${row.cover_i}-L.jpg`,
      full: `https://covers.openlibrary.org/b/id/${row.cover_i}-L.jpg`,
      pageUrl: `https://openlibrary.org${row.key}`,
      artist: Array.isArray(row.author_name) ? row.author_name.slice(0, 2).join(', ') : row.author_name || '',
      license: 'Sampul buku',
      description: '',
      year: row.first_publish_year || ''
    }));

  return { items, hasNext: (json.numFound || 0) > page * 20 };
}

let ghibliCache = null;

async function searchGhibli(query, page = 1) {
  const term = cleanSearchTerm(query).toLowerCase();
  if (!ghibliCache) {
    ghibliCache = await getJSON('https://ghibliapi.vercel.app/films', {}, 15000);
  }
  const films = Array.isArray(ghibliCache) ? ghibliCache : [];
  const filtered = term
    ? films.filter((film) => `${film.title} ${film.original_title} ${film.description}`.toLowerCase().includes(term))
    : films;

  const items = filtered.slice(0, 24).map((film) => ({
    kind: 'anime',
    id: `ghibli-${film.id}`,
    source: 'Studio Ghibli',
    sourceUrl: `https://ghibliapi.vercel.app/films/${film.id}`,
    title: film.title,
    altTitle: film.original_title || '',
    poster: film.image || '',
    banner: film.movie_banner || '',
    color: '#1a1f2e',
    year: film.release_date ? Number(String(film.release_date).slice(0, 4)) : null,
    episodes: null,
    duration: film.running_time || null,
    score: film.rt_score ? Number(film.rt_score) : null,
    format: 'Film',
    status: '',
    genres: [],
    description: plainText(film.description),
    trailer: null
  }));

  return { items, hasNext: false };
}

async function searchDisney(query, page = 1) {
  const term = cleanSearchTerm(query);
  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (term) params.set('name', term);

  const json = await getJSON(`https://api.disneyapi.dev/character?${params}`, {}, 15000);
  const rows = Array.isArray(json.data) ? json.data : (json.data ? [json.data] : []);
  const items = rows.map((row) => ({
    kind: 'photo',
    id: `disney-${row._id}`,
    source: 'Disney API',
    title: row.name || 'Tanpa judul',
    thumb: row.imageUrl || '',
    full: row.imageUrl || '',
    pageUrl: `https://disneyapi.dev/character/${row._id}`,
    artist: 'Disney',
    license: 'Fan API',
    description: Array.isArray(row.films) ? truncate(row.films.join(', '), 200) : '',
    year: ''
  }));

  const totalPages = json.info ? json.info.totalPages || 1 : 1;
  return { items, hasNext: page < totalPages };
}

async function searchPeerTube(host, query, page = 1) {
  const term = cleanSearchTerm(query) || 'documentary';
  const count = 18;
  const start = (page - 1) * count;
  const params = new URLSearchParams({ search: term, count: String(count), start: String(start) });
  const json = await getJSON(`https://${host}/api/v1/search/videos?${params}`, {}, 15000);
  const list = Array.isArray(json.data) ? json.data : [];

  const items = list.map((video) => ({
    kind: 'video',
    id: `peertube-${host}-${video.uuid}`,
    source: host,
    title: video.name || 'Tanpa judul',
    thumb: video.thumbnailPath ? `https://${host}${video.thumbnailPath}` : '',
    full: '',
    embedUrl: `https://${host}/videos/embed/${video.uuid}`,
    pageUrl: video.url || `https://${host}/w/${video.shortUUID}`,
    creator: video.channel ? video.channel.displayName : '',
    year: video.publishedAt ? String(video.publishedAt).slice(0, 4) : '',
    description: truncate(plainText(video.description), 220)
  }));

  return { items, hasNext: start + items.length < (json.total || 0) };
}

/* -------------------------------------------------------------------------- */
/* Registry sumber tambahan                                                    */
/* -------------------------------------------------------------------------- */

function commonsChannel(id, label, category, kind = 'photo') {
  return {
    id,
    kind,
    label,
    group: 'Wikimedia Commons',
    note: `Koleksi ${category}.`,
    defaultEnabled: false,
    search: (query, page, sort) => searchCommonsChannel({ kind, category }, query, page, sort)
  };
}

function archiveChannel(id, label, query, kind = 'video') {
  return {
    id,
    kind,
    label,
    group: 'Internet Archive',
    note: 'Koleksi Internet Archive.',
    defaultEnabled: false,
    search: (q, page, sort) => searchArchiveChannel({ kind, label, query }, q, page, sort)
  };
}

function peerTubeChannel(host, label) {
  return {
    id: `peertube-${host.replace(/[^a-z0-9]+/gi, '-')}`,
    kind: 'video',
    label,
    group: 'PeerTube',
    note: `Instance PeerTube ${host}.`,
    defaultEnabled: false,
    search: (query, page) => searchPeerTube(host, query, page)
  };
}

export const EXTRA_SOURCES = [
  /* Anime */
  { id: 'jikan', kind: 'anime', label: 'MyAnimeList (Jikan)', group: 'Anime', note: 'Database MyAnimeList. Kadang diblokir sebagian ISP.', defaultEnabled: false, search: searchJikan },
  { id: 'kitsu', kind: 'anime', label: 'Kitsu', group: 'Anime', note: 'Katalog anime komunitas.', defaultEnabled: false, search: searchKitsu },
  { id: 'ghibli', kind: 'anime', label: 'Studio Ghibli', group: 'Anime', note: 'Katalog film Studio Ghibli.', defaultEnabled: false, search: searchGhibli },

  /* Foto */
  { id: 'tvmaze', kind: 'photo', label: 'TVmaze', group: 'Foto', note: 'Poster dan still acara TV.', defaultEnabled: false, search: searchTvmaze },
  { id: 'openlibrary', kind: 'photo', label: 'Open Library', group: 'Foto', note: 'Sampul buku dari Internet Archive.', defaultEnabled: false, search: searchOpenLibrary },
  { id: 'disney', kind: 'photo', label: 'Disney API', group: 'Foto', note: 'Karakter dan gambar Disney.', defaultEnabled: false, search: searchDisney },

  /* Wikimedia Commons */
  commonsChannel('commons-cosplay', 'Commons · Cosplay', 'Cosplay'),
  commonsChannel('commons-anime', 'Commons · Anime', 'Anime'),
  commonsChannel('commons-manga', 'Commons · Manga', 'Manga'),
  commonsChannel('commons-featured', 'Commons · Featured Pictures', 'Featured pictures on Wikimedia Commons'),
  commonsChannel('commons-quality', 'Commons · Quality Images', 'Quality images'),
  commonsChannel('commons-space', 'Commons · Antariksa', 'Space'),
  commonsChannel('commons-nature', 'Commons · Alam', 'Nature'),
  commonsChannel('commons-paintings', 'Commons · Lukisan', 'Paintings'),
  commonsChannel('commons-architecture', 'Commons · Arsitektur', 'Architecture'),
  commonsChannel('commons-food', 'Commons · Makanan', 'Food'),
  commonsChannel('commons-dogs', 'Commons · Anjing', 'Dogs'),
  commonsChannel('commons-cats', 'Commons · Kucing', 'Cats'),
  commonsChannel('commons-birds', 'Commons · Burung', 'Birds'),
  commonsChannel('commons-flowers', 'Commons · Bunga', 'Flowers'),
  commonsChannel('commons-fashion', 'Commons · Fashion', 'Fashion'),
  commonsChannel('commons-music', 'Commons · Musik', 'Music'),
  commonsChannel('commons-sport', 'Commons · Olahraga', 'Sport'),
  commonsChannel('commons-maps', 'Commons · Peta', 'Maps'),
  commonsChannel('commons-cars', 'Commons · Mobil', 'Automobiles'),
  commonsChannel('commons-trees', 'Commons · Pohon', 'Trees'),
  commonsChannel('commons-mountains', 'Commons · Gunung', 'Mountains'),
  commonsChannel('commons-sunsets', 'Commons · Senja', 'Sunsets'),
  commonsChannel('commons-clouds', 'Commons · Awan', 'Clouds'),
  commonsChannel('commons-insects', 'Commons · Serangga', 'Insects'),

  /* Internet Archive — film */
  archiveChannel('ia-feature-films', 'IA · Feature Films', 'collection:feature_films'),
  archiveChannel('ia-classic-tv', 'IA · Classic TV', 'collection:classic_tv'),
  archiveChannel('ia-prelinger', 'IA · Prelinger', 'collection:prelinger'),
  archiveChannel('ia-cartoons', 'IA · Kartun', 'collection:animationandcartoons'),
  archiveChannel('ia-shorts', 'IA · Film Pendek', 'collection:short_films'),
  archiveChannel('ia-news', 'IA · Berita', 'collection:newsandpublicaffairs'),
  archiveChannel('ia-sports', 'IA · Olahraga', 'collection:sports'),
  archiveChannel('ia-nasa', 'IA · NASA', 'collection:nasa'),
  archiveChannel('ia-computer', 'IA · Computer Chronicles', 'collection:computerchronicles'),
  archiveChannel('ia-television', 'IA · Televisi', 'collection:television'),
  archiveChannel('ia-movies', 'IA · Semua Film', 'collection:moviesandfilms'),
  archiveChannel('ia-noir', 'IA · Film Noir', 'subject:"film noir"'),
  archiveChannel('ia-western', 'IA · Western', 'subject:western'),
  archiveChannel('ia-scifi', 'IA · Sci-Fi', 'subject:"science fiction"'),
  archiveChannel('ia-comedy', 'IA · Komedi', 'subject:comedy'),
  archiveChannel('ia-documentary', 'IA · Dokumenter', 'subject:documentary'),
  archiveChannel('ia-travel', 'IA · Travel', 'subject:travel'),

  /* Internet Archive — foto */
  archiveChannel('ia-comics', 'IA · Komik', 'collection:comics', 'photo'),
  archiveChannel('ia-nasa-images', 'IA · Foto NASA', 'collection:nasa', 'photo'),

  /* PeerTube */
  peerTubeChannel('tilvids.com', 'PeerTube · Tilvids'),
  peerTubeChannel('peertube.tv', 'PeerTube · PeerTube.tv'),
  peerTubeChannel('kolektiva.media', 'PeerTube · Kolektiva'),
  peerTubeChannel('tube.tchncs.de', 'PeerTube · tchncs'),
  peerTubeChannel('video.blender.org', 'PeerTube · Blender'),
  peerTubeChannel('makertube.net', 'PeerTube · MakerTube'),
  peerTubeChannel('spectra.video', 'PeerTube · Spectra'),
  peerTubeChannel('tube.shanti.cafe', 'PeerTube · Shanti Cafe')
];

const CORE_SOURCES = BUILTIN_SOURCES.map((source) => ({
  ...source,
  group: source.group || (source.kind === 'anime' ? 'Anime' : source.kind === 'photo' ? 'Foto' : 'Video')
}));

export const ALL_SOURCES = [...CORE_SOURCES, ...EXTRA_SOURCES];
