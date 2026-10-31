/**
 * AniCari data layer.
 * Semua fungsi di sini memanggil API publik yang ramah CORS, tanpa kunci API.
 *
 *  - Anime  : AniList GraphQL  (https://anilist.co)
 *  - Foto   : Wikimedia Commons (https://commons.wikimedia.org)
 *  - Video  : Internet Archive  (https://archive.org)
 */

const ANILIST_URL = 'https://graphql.anilist.co';
const COMMONS_URL = 'https://commons.wikimedia.org/w/api.php';
const ARCHIVE_URL = 'https://archive.org/advancedsearch.php';
const COMMONS_LIMIT = 24;
const ARCHIVE_LIMIT = 18;

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

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

async function getJSON(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Ubah potongan HTML/teks dari API menjadi teks biasa yang aman ditampilkan. */
export function plainText(input = '') {
  if (!input) return '';
  const decoded = String(input)
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
  return decoded;
}

function truncate(text, max = 180) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function cleanSearchTerm(value) {
  return String(value || '').trim().replace(/["\\<>]/g, '').slice(0, 120);
}

/* -------------------------------------------------------------------------- */
/* Anime — AniList                                                             */
/* -------------------------------------------------------------------------- */

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

/**
 * Cari anime. Tanpa kata kunci, mengembalikan anime yang sedang trending.
 * @param {string} query
 * @param {number} page
 */
export async function searchAnime(query, page = 1, perPage = 18) {
  const term = cleanSearchTerm(query);
  const hasTerm = term.length > 0;

  const gql = hasTerm
    ? `query ($search: String, $page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          pageInfo { hasNextPage }
          media(search: $search, type: ANIME, sort: SEARCH_MATCH) { ${ANIME_FIELDS} }
        }
      }`
    : `query ($page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          pageInfo { hasNextPage }
          media(type: ANIME, sort: TRENDING_DESC) { ${ANIME_FIELDS} }
        }
      }`;

  const variables = hasTerm ? { search: term, page, perPage } : { page, perPage };
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

  return {
    items,
    hasNext: Boolean(pageData && pageData.pageInfo && pageData.pageInfo.hasNextPage)
  };
}

/* -------------------------------------------------------------------------- */
/* Foto & video — Wikimedia Commons                                            */
/* -------------------------------------------------------------------------- */

function mapCommons(page) {
  const info = (page.imageinfo && page.imageinfo[0]) || {};
  const meta = info.extmetadata || {};
  const mime = info.mime || '';
  const kind = mime.startsWith('video/') ? 'video' : 'photo';
  const fileTitle = String(page.title || '').replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ');

  return {
    kind,
    id: `commons-${page.pageid}`,
    source: 'Wikimedia Commons',
    title: fileTitle,
    thumb: info.thumburl || info.url || '',
    full: info.url || info.thumburl || '',
    pageUrl: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title || '')}`,
    mime,
    artist: truncate(plainText(meta.Artist && meta.Artist.value), 70),
    license: truncate(plainText(meta.LicenseShortName && meta.LicenseShortName.value), 40),
    description: truncate(plainText(meta.ImageDescription && meta.ImageDescription.value), 220),
    year: meta.DateTimeOriginal ? String(plainText(meta.DateTimeOriginal.value)).slice(0, 10) : ''
  };
}

/**
 * Cari foto atau video berlisensi bebas di Wikimedia Commons.
 * @param {string} query
 * @param {number} page 1-based
 * @param {'photo'|'video'} kind
 */
export async function searchCommons(query, page = 1, kind = 'photo') {
  const term = cleanSearchTerm(query);
  const filetype = kind === 'video' ? 'video' : 'bitmap';

  // Tanpa kata kunci: tampilkan foto pilihan (featured pictures) sebagai rekomendasi.
  const search = term
    ? `${term} filetype:${filetype}`
    : `incategory:"Featured pictures on Wikimedia Commons" filetype:${filetype}`;

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

  const json = await getJSON(`${COMMONS_URL}?${params.toString()}`, {}, 15000);
  const pages = (json.query && json.query.pages) || {};

  const items = Object.values(pages)
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .map(mapCommons)
    .filter((item) => (kind === 'video' ? item.kind === 'video' : item.kind === 'photo'));

  const hasNext = Boolean(json.continue && json.continue.gsroffset);

  return { items, hasNext };
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

/**
 * Cari film / dokumenter / video di Internet Archive.
 * @param {string} query
 * @param {number} page
 */
export async function searchVideos(query, page = 1) {
  const term = cleanSearchTerm(query);
  const rows = ARCHIVE_LIMIT;
  const start = (page - 1) * rows;

  const search = term
    ? `mediatype:movies AND (title:(${escapeArchiveTerm(term)}) OR description:(${escapeArchiveTerm(term)}))`
    : 'mediatype:movies AND collection:feature_films';

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
  params.append('sort[]', 'downloads desc');

  const json = await getJSON(`${ARCHIVE_URL}?${params.toString()}`, {}, 20000);
  const response = (json && json.response) || {};
  const docs = response.docs || [];

  return {
    items: docs.map(mapArchive),
    hasNext: start + docs.length < (response.numFound || 0),
    total: response.numFound || 0
  };
}

export const PROVIDERS = {
  anime: { label: 'AniList', color: '#ff4d8d' },
  photo: { label: 'Wikimedia Commons', color: '#2dd4bf' },
  video: { label: 'Internet Archive', color: '#7c5cff' }
};
