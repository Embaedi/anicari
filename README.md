# AniCari 🔎

**Pencari anime, foto, dan video dokumenter dalam satu kotak — gratis, tanpa iklan, open source.**

🔗 **Live:** https://embaedi.github.io/anicari/
📦 **Repo:** https://github.com/Embaedi/anicari

AniCari adalah situs statis yang mencari ke beberapa arsip terbuka sekaligus dan menampilkan hasilnya dalam satu halaman. Tidak ada server, tidak ada database, tidak ada akun, dan tidak ada pelacakan — semua permintaan berjalan langsung dari browser kamu.

---

## ✨ Fitur

- **Pencarian gabungan** — satu kata kunci, hasil dari tiga sumber: anime, foto, dan video.
- **Tab per jenis media** — Semua, Anime, Foto, Video, plus tombol *Muat lebih banyak* untuk hasil tambahan.
- **Detail di dalam modal** — sinopsis anime + trailer YouTube, foto resolusi penuh, dan pemutar video Internet Archive.
- **Lisensi terlihat** — setiap foto menampilkan pembuat dan lisensinya.
- **Deep link** — hasil bisa dibagikan lewat `?q=frieren&tab=anime`.
- **Responsif & aksesibel** — jalan di ponsel, mendukung keyboard (`/` untuk fokus pencarian, `Esc` untuk menutup modal) dan `prefers-reduced-motion`.
- **Tanpa build step** — HTML, CSS, dan JavaScript murni. Cukup buka atau host.

## 🧩 Sumber data

| Jenis | Sumber | API | Kunci? |
| ----- | ------ | --- | ------ |
| Anime | [AniList](https://anilist.co) | GraphQL `graphql.anilist.co` | Tidak |
| Foto | [Wikimedia Commons](https://commons.wikimedia.org) | MediaWiki API | Tidak |
| Video | [Internet Archive](https://archive.org) | Advanced Search API | Tidak |

Ketiganya mengirim header CORS sehingga bisa dipanggil langsung dari GitHub Pages tanpa proxy. Tidak ada kunci API yang perlu disimpan, jadi tidak ada rahasia di repo ini.

## 🗂️ Struktur

```
anicari/
├── index.html              # markup + hero + tab
├── assets/
│   ├── css/style.css       # tema gelap, grid, modal
│   └── js/
│       ├── api.js          # adaptor AniList / Commons / Archive
│       └── app.js          # state, render kartu, modal, URL
├── LICENSE
└── .nojekyll
```

## 🚀 Menjalankan lokal

Karena ini situs statis, cukup sajikan foldernya lewat HTTP (jangan buka lewat `file://` karena ES module diblokir):

```bash
# pilihan 1: Node
npx serve .

# pilihan 2: Python
python3 -m http.server 3000
```

Lalu buka `http://localhost:3000`.

## ☁️ Deploy gratis ke GitHub Pages

1. Fork/clone repo ini.
2. Buka **Settings → Pages**.
3. Bagian **Build and deployment** pilih **Deploy from a branch**, branch `main`, folder `/ (root)`.
4. Simpan. Situs tersedia di `https://<username>.github.io/anicari/` dalam ±1 menit.

Tidak perlu Actions, tidak perlu secrets. Setiap `git push` ke `main` otomatis memperbarui situs.

## 🛠️ Menambah sumber pencarian

Semua sumber berada di `assets/js/api.js` dengan bentuk hasil yang sama:

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

Tambahkan fungsi `searchX(query, page)`, daftarkan di `SOURCES` pada `app.js`, dan buat tab baru bila perlu. Contoh kandidat: Openverse, Pexels/Pixabay (perlu kunci), atau Spotify/Last.fm untuk musik.

## ⚠️ Catatan

- AniCari hanya menampilkan metadata dan tautan; media tetap dimuat dari penyedia aslinya.
- Hak cipta dan lisensi setiap karya milik pembuatnya. Selalu cek halaman sumber sebelum memakai ulang.
- Internet Archive dan Wikimedia Commons adalah arsip publik — ketersediaan konten dapat berubah sewaktu-waktu.

## 📄 Lisensi

Kode: [MIT](LICENSE). Data dan media: sesuai lisensi masing-masing sumber.
