# imagekit-proxy

Proxy `ik.imagekit.io/maarifdh` via `ik.maarifdh.sch.id` biar lolos blokir Kominfo/DNS ISP Indonesia.

- **Upstream:** `https://ik.imagekit.io/maarifdh/*` (transformasi `?tr=` tetap jalan)
- **Proxy:** `https://ik.maarifdh.sch.id/*`
- **Cache:** Cloudflare `caches.default` + `Cache-Control: 1 hari` + `stale-while-revalidate`

## Kenapa

`ik.imagekit.io` diblokir di DNS ISP Indonesia → semua `<img src="https://ik.imagekit.io/maarifdh/...">` gagal load. Proxy lewat Worker (IP Cloudflare, keluar via jaringan Cloudflare) lolos blokir tanpa pindah hosting.

## Cara pakai

Find-replace di semua project:

```
https://ik.imagekit.io/maarifdh  →  https://ik.maarifdh.sch.id
```

Contoh:

```html
<!-- sebelum -->
<img src="https://ik.imagekit.io/maarifdh/aset-gambar/logo-mts.png?tr=w-300,f-webp" />
<video><source src="https://ik.imagekit.io/maarifdh/kegiatan/hero-upacara-landscape.mp4" /></video>

<!-- sesudah -->
<img src="https://ik.maarifdh.sch.id/aset-gambar/logo-mts.png?tr=w-300,f-webp" />
<video><source src="https://ik.maarifdh.sch.id/kegiatan/hero-upacara-landscape.mp4" /></video>
```

Worker lain **tidak perlu** diubah — cukup ganti string URL.

## Deploy

```bash
npm i -g wrangler
wrangler login
wrangler deploy
# atau
npx wrangler deploy
```

Route `ik.maarifdh.sch.id/*` sudah di `wrangler.toml` (zone `maarifdh.sch.id`). Pastikan DNS `ik` di Cloudflare bertipe **Proxied (orange cloud)**.

## Health check

```
https://ik.maarifdh.sch.id/  →  ik.maarifdh.sch.id — ImageKit proxy OK
```

## Catatan

- Hanya `GET`/`HEAD` + `OPTIONS` yang diizinkan; bukan open proxy liar.
- Header `Range` diteruskan → video `.mp4` dengan streaming/seek tetap jalan.
- Hanya response `200`/`206` yang di-cache.
- `Access-Control-Allow-Origin: *` biar bisa dipakai lintas domain.
