# AniCari 🔎

**Pencari anime, foto, dan video dokumenter dalam satu kotak — gratis, tanpa iklan, open source.**

🔗 **Live:** https://embaedi.github.io/anicari/
📦 **Repo:** https://github.com/Embaedi/anicari

AniCari adalah situs statis yang mencari ke banyak arsip terbuka sekaligus dan menampilkannya dalam satu halaman. Tidak ada server, tidak ada database, tidak ada akun, dan tidak ada pelacakan — semua permintaan berjalan langsung dari browser.

---

## ✨ Fitur

- **Pencarian gabungan** — satu kata kunci, hasil dari anime, foto, dan video.
- **64 sumber bawaan** — dikelompokkan per kategori (Anime, Foto, Video, Wikimedia Commons, Internet Archive, PeerTube) dan bisa dicentang satu per satu.
- **Sumber kustom buatan pengguna** — tambahkan API JSON apa pun lewat menu **Sumber**, tanpa mengubah kode dan tanpa deploy ulang.
- **Bisa dinyalakan/dimatikan** — setiap sumber punya tombol on/off; pengaturan disimpan di `localStorage`.
- **Tab per jenis media** — Semua, Anime, Foto, Video, dengan tombol *Muat lebih banyak*.
- **Detail di dalam modal** — sinopsis + trailer anime, foto ukuran besar, pemutar video Internet Archive/Dailymotion, dan embed YouTube/Vimeo otomatis untuk sumber kustom.
- **Ingat progres tontonan** — tandai episode yang sudah ditonton; AniCari menampilkan badge Ep 4/28 dan baris **Lanjutkan menonton** di halaman utama.
- **Urutkan hasil** — terpopuler, skor tertinggi, atau terbaru (sesuai sumber).
- **Pilih cara menonton** — buka detail di AniCari (dengan pemutar) atau langsung ke situs sumber, diatur dari menu **Sumber**.
- **Deep link** — hasil bisa dibagikan lewat `?q=frieren&tab=anime`.
- **Responsif & aksesibel** — jalan di ponsel, dukungan keyboard (`/` fokus pencarian, `Esc` menutup modal), dan `prefers-reduced-motion`.
- **Tanpa build step** — HTML, CSS, dan JavaScript murni.

## ▶️ Menonton & progres

- **Video** dari Internet Archive, Dailymotion, dan sumber kustom diputar langsung di modal AniCari (embed resmi). Tombol **Buka halaman sumber** selalu tersedia.
- **Anime**: AniCari menampilkan trailer resmi dari YouTube. Episode penuh tidak di-host di sini — gunakan tautan AniList/sumber untuk menonton, lalu tandai progresnya di AniCari.
- **Progres episode** disimpan per anime di localStorage, muncul sebagai badge di kartu dan baris *Lanjutkan menonton* saat halaman utama dibuka.
- **Mode klik** diatur di menu **Sumber** → *Saat kartu diklik*: buka detail, atau langsung buka situs sumber di tab baru.

## 🧩 Sumber bawaan

Total **64 sumber** dalam 6 grup:

| Grup | Jumlah | Isi |
| ---- | ------ | --- |
| Anime | 4 | AniList, Kitsu, MyAnimeList (Jikan), Studio Ghibli |
| Foto | 6 | Wikimedia Commons, NASA, Openverse, TVmaze, Open Library, Disney |
| Video | 3 | Internet Archive, Wikimedia Commons Video, Dailymotion |
| Wikimedia Commons | 24 | Cosplay, Anime, Manga, Featured Pictures, alam, lukisan, makanan, hewan, dll. |
| Internet Archive | 19 | Feature Films, Classic TV, Prelinger, kartun, film pendek, berita, NASA, film noir, western, sci-fi, komedi, dokumenter, komik |
| PeerTube | 8 | Tilvids, PeerTube.tv, Kolektiva, tchncs, Blender, MakerTube, Spectra, Shanti Cafe |

Hanya **4 sumber inti** yang aktif secara default: AniList, Wikimedia Commons, Internet Archive, dan Wikimedia Commons Video. Sisanya tinggal dicentang. Semua memakai API publik tanpa kunci (kecuali API yang memang membatasi jaringan, seperti Jikan/Openverse/Dailymotion) dan mengirim header CORS.

## ✅ Memilih sumber

1. Klik **⚙ Sumber**.
2. Gunakan kotak **Cari sumber…** untuk menyaring daftar.
3. Centang sumber yang diinginkan, atau tekan **Aktifkan semua** pada grup tertentu.
4. Buka tab **Anime/Foto/Video** untuk melihat hasil dari sumber yang dicentang.

> Semakin banyak sumber aktif, semakin lama pencarian karena setiap sumber dipanggil paralel (dibatasi 4 permintaan per host). Pilihan disimpan di `anicari.sources.enabled`.

## ➕ Menambah sumber kustom (tanpa kode)

1. Klik tombol **⚙ Sumber** di kanan atas.
2. Isi formulir **Sumber kustom**:

   | Field | Arti |
   | ----- | ---- |
   | Nama | Label yang muncul di kartu, mis. `Pixabay` |
   | Jenis | `Foto` atau `Video` |
   | URL pencarian | Template dengan `{q}` (kata kunci), `{page}`, `{pageSize}` |
   | Header JSON | Opsional, mis. `{"Authorization": "Bearer KUNCI"}` |
   | Path items | Lokasi array hasil, mis. `hits` atau `collection.items` |
   | Path judul | Mis. `title` atau `data.0.title` |
   | Path gambar | Mis. `webformatURL` atau `links.0.href` |
   | Path link | Halaman sumber |
   | Path deskripsi | Opsional |

3. Tekan **Tes koneksi** untuk memastikan path benar, lalu **Simpan sumber**.
4. Sumber baru langsung muncul di tab **Foto**/**Video** (bukan di tab Semua) dan tersimpan di browser kamu.

### Contoh konfigurasi

**Pixabay** (gratis, butuh API key di URL):

```
URL   : https://pixabay.com/api/?key=KUNCI&q={q}&page={page}&per_page=20
items : hits
judul : tags
gambar: webformatURL
link  : pageURL
```

**Pexels** (butuh header `Authorization`):

```
URL   : https://api.pexels.com/v1/search?query={q}&page={page}&per_page=20
header: {"Authorization": "KUNCI"}
items : photos
judul : alt
gambar: src.medium
link  : url
```

**NASA Image Library** (sudah jadi sumber bawaan, contoh path bersarang):

```
URL   : https://images-api.nasa.gov/search?q={q}&media_type=image&page={page}
items : collection.items
judul : data.0.title
gambar: links.0.href
link  : href
```

> ⚠️ API harus mengizinkan **CORS** karena dipanggil dari browser. Kunci API hanya disimpan di `localStorage` perangkatmu — jangan pakai kunci rahasia di komputer bersama.

## 🛠️ Menambah sumber bawaan (ubah kode)

Semua sumber ada di `assets/js/api.js` dengan bentuk hasil yang sama:

```js
{
  kind: 'photo',        // anime | photo | video
  id: 'unik',
  title: '...',
  thumb: 'https://...', // thumbnail
  full: 'https://...',  // gambar/video penuh (opsional)
  pageUrl: 'https://...',
  source: 'Nama Sumber'
}
```

Tambahkan fungsi `searchX(query, page)`, lalu daftarkan di array `BUILTIN_SOURCES`:

```js
{
  id: 'sumberku',
  kind: 'photo',
  label: 'Sumberku',
  note: 'Deskripsi singkat.',
  defaultEnabled: true,
  search: searchX
}
```

Tidak perlu mengubah `app.js`; tab dan pengaturan sumber dibuat otomatis.

## 🗂️ Struktur

```
anicari/
├── index.html              # markup, hero, tab, modal detail & pengaturan
├── assets/
│   ├── css/style.css       # tema gelap, grid, modal, form sumber
│   └── js/
│       ├── api.js          # sumber bawaan + parser sumber kustom
│       └── app.js          # state, render, pengaturan, URL, localStorage
├── LICENSE
└── .nojekyll
```

## 🚀 Menjalankan lokal

Situs ini statis; sajikan lewat HTTP (ES module tidak jalan di `file://`):

```bash
npx serve .
# atau
python3 -m http.server 3000
```

Buka `http://localhost:3000`.

## ☁️ Deploy gratis ke GitHub Pages

1. Fork/clone repo ini.
2. Buka **Settings → Pages**.
3. Pilih **Deploy from a branch**, branch `main`, folder `/ (root)`.
4. Simpan; situs tersedia di `https://<username>.github.io/anicari/` dalam ±1 menit.

Tidak perlu Actions atau secrets. Setiap push ke `main` otomatis memperbarui situs.

## ⚠️ Catatan

- AniCari hanya menampilkan metadata dan tautan; media dimuat dari penyedia aslinya.
- Hak cipta dan lisensi setiap karya milik pembuatnya. Selalu cek halaman sumber sebelum memakai ulang.
- Dailymotion/Internet Archive adalah platform pihak ketiga; ketersediaan konten dapat berubah.
- Semua preferensi tersimpan lokal di browser dan tidak dikirim ke mana pun: `anicari.sources.enabled`, `anicari.custom`, `anicari.progress`, `anicari.sort`, `anicari.clickMode`.
- Progres tontonan bersifat lokal per perangkat; tidak ada sinkronisasi antar perangkat.

## 📄 Lisensi

Kode: [MIT](LICENSE). Data dan media: sesuai lisensi masing-masing sumber.
