# Deployment

Pipeline: `.github/workflows/deploy.yml` (push ke `main` atau `workflow_dispatch`).

Deploy **tidak memakai SSH**. Job deploy berjalan di _self-hosted runner_ yang
terpasang di host produksi, jadi ia mengeksekusi `docker compose` secara lokal.
Runner yang belum siap / docker yang tidak bisa diakses gagal di job `precheck`,
sebelum image dibangun.

```
ci (lint + unit + integration)                ← GitHub-hosted (.github/workflows/ci.yml)
  → precheck host                             ← self-hosted (cek docker + SERVER_DIR)
  → build & push image :sha-<commit> + :latest ← GitHub-hosted (cache gha)
      → deploy (self-hosted, docker compose lokal):
         1. salin docker-compose.yml + Caddyfile ke SERVER_DIR
         2. buat .env HANYA kalau belum ada (bootstrap dari ENV_FILE_B64)
         3. tulis IMAGE_TAG ke .env
         4. recreate rustfs (kredensial dibaca ulang dari env)
         5. pull image (tag = sha-<commit>)
         6. tunggu MariaDB siap
         7. backup DB ke backups/db-<timestamp>.sql
         8. prisma migrate deploy
         9. docker compose up -d --remove-orphans --wait
        10. cek /health dari dalam container
        11. smoke test lewat domain publik (Caddy + TLS ikut terbukti)
```

Build sengaja tetap di GitHub-hosted runner: host produksi hanya punya ~2 GB RAM
dan image dibangun di sana akan berebut memori dengan MariaDB. Yang dipindah ke
self-hosted hanya bagian yang **harus** menyentuh host itu.

`main` **tidak** memicu `ci.yml` sendiri: gate kualitasnya datang dari
`workflow_call` di Deploy, supaya commit yang sama tidak divalidasi dua kali.
Job `docker` (build tanpa push) tetap jalan di PR dan push ke `development`, tapi
dimatikan saat dipanggil Deploy (`build_image: false`) karena Deploy memang
membangun image yang sama beberapa langkah kemudian.

Semua langkah skrip diawali `set -euo pipefail`, jadi berhenti di perintah
pertama yang gagal. Kalau ada langkah yang gagal setelah trap dipasang, deploy
**rollback otomatis** ke tag `sha-*` sebelumnya.

## Secret GitHub yang dibutuhkan

| Secret         | Wajib | Isi                                            |
| -------------- | ----- | ---------------------------------------------- |
| `ENV_FILE_B64` | tidak | isi `.env` produksi, **di-base64** (bootstrap) |

`SERVER_HOST` / `SERVER_USER` / `SERVER_KEY` / `SERVER_FINGERPRINT` dan
`GHCR_TOKEN` **tidak dipakai lagi**: deploy tidak memakai SSH, dan pull image
memakai `GITHUB_TOKEN` bawaan workflow (`packages: read`). Kalau secret lama
masih ada, tidak mengganggu — tapi boleh dihapus.

`ENV_FILE_B64` **hanya** dibaca kalau `SERVER_DIR/.env` belum ada. Pada deploy
normal, `.env` di server dipertahankan apa adanya. Ini perubahan perilaku yang
penting: sebelumnya `.env` ditimpa dari secret setiap deploy, dan itu pernah
menghapus perbaikan `CORS_ORIGINS` di server sehingga admin & mitra langsung
diblokir CORS.

Membuat `ENV_FILE_B64` (untuk memulihkan host dari nol):

```bash
base64 -w0 .env   # salin seluruh output, tempel sebagai nilai secret
```

Dikirim sebagai environment variable lalu di-decode di host, bukan
diinterpolasi ke dalam teks skrip — password berisi `$`, backtick, atau baris
`EOF` tidak merusak `.env`.

Environment GitHub `production` dipakai job deploy (bisa diberi required
reviewer). Environment dibuat otomatis, tapi tanpa reviewer sampai
dikonfigurasi.

## Runner self-hosted

Terpasang di host produksi:

| Item    | Nilai                                                     |
| ------- | --------------------------------------------------------- |
| Dir     | `/home/taslim/actions-runner`                             |
| Service | `actions.runner.rakhathegreat-arxiva-backend.Taslim`      |
| Label   | `self-hosted` (workflow memakai `runs-on: [self-hosted]`) |
| User    | `taslim` (anggota grup `docker`)                          |

Kalau runner dijalankan lewat `./run.sh` saja, ia **mati saat logout/reboot** dan
job deploy akan menggantung di status "Waiting for a runner". Pasang sebagai
service:

```bash
cd ~/actions-runner
sudo ./svc.sh install taslim
sudo ./svc.sh start
sudo ./svc.sh status        # harus "active (running)" + "Listening for Jobs"
systemctl is-enabled actions.runner.rakhathegreat-arxiva-backend.Taslim
```

Prasyarat di host: `git` (dipakai `actions/checkout`), Docker + plugin compose,
`curl`, dan user runner bisa menulis ke `SERVER_DIR`.

> **Keamanan.** Repo ini publik dan runner berada di host produksi dengan akses
> Docker (efektif root). Karena itu job yang dipicu `pull_request` **tidak boleh**
> dijalankan di runner ini — siapa pun yang mengirim PR bisa mengeksekusi kode di
> server. `ci.yml` karenanya tetap di GitHub-hosted, dan job `deploy` hanya
> berjalan pada push ke `main` / `workflow_dispatch`.

Kalau nanti ada runner self-hosted lain, tambahkan label khusus (mis. `taslim`)
dan persempit `runs-on` agar deploy tidak mendarat di mesin yang salah.

## Troubleshooting deploy

**Job menggantung "Waiting for a runner to pick up this job"** — service runner
tidak jalan atau offline:

```bash
sudo systemctl status actions.runner.rakhathegreat-arxiva-backend.Taslim
journalctl -u actions.runner.rakhathegreat-arxiva-backend.Taslim -n 30
```

**`cannot connect to the Docker daemon` / `permission denied` saat `docker
info`** — user runner belum masuk grup `docker`. Perbaiki lalu restart service:

```bash
sudo usermod -aG docker taslim
sudo systemctl restart actions.runner.rakhathegreat-arxiva-backend.Taslim
```

**`pull access denied` / `unauthorized` saat `docker compose pull backend`** —
package GHCR privat dan `GITHUB_TOKEN` tidak cukup. Beri job `packages: read`
(sekarang sudah), atau jadikan package-nya publik.

**Deploy gagal dengan pesan `.env belum ada dan secret ENV_FILE_B64 kosong`** —
host baru. Isi secret `ENV_FILE_B64` sekali, lalu deploy berikutnya tidak lagi
membutuhkannya.

**`No space left on device`** — image lama hanya dibersihkan yang berlabel repo
ini (>336 jam). Cek manual:

```bash
docker system df
docker image prune -af --filter "until=336h" --filter "label=org.opencontainers.image.source=https://github.com/rakhathegreat/arxiva-backend"
```

## Prasyarat server

- Docker Engine + Docker Compose **>= 2.20** (`--wait`, `--wait-timeout`):
  `docker compose version`. Pipeline memeriksa ini dan berhenti dengan pesan
  jelas kalau belum ada.
- `.env` produksi memuat `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`,
  `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` — compose menolak start kalau kosong.
  Kalau `MYSQL_DATABASE` tidak diisi, nilainya default `arxiva` (dipakai juga
  oleh langkah backup).
- **`CORS_ORIGINS` wajib diisi kalau ada klien browser/webview.** Kosong di
  production berarti **semua** origin browser ditolak (request tetap diproses,
  tapi browser memblokir responsnya — gejalanya
  `Origin http://localhost:1420 is not allowed by Access-Control-Allow-Origin`).
  Aplikasi admin & mitra sekarang SPA yang di-host di Vercel, jadi origin
  produksinya wajib terdaftar:

  ```
  CORS_ORIGINS=https://taslim-admin.vercel.app,https://taslim-mitra.vercel.app,http://localhost:5173,http://127.0.0.1:5173,http://localhost:1420,http://127.0.0.1:1420
  ```

  Dua origin pertama produksi (Vercel), sisanya untuk `npm run dev` (Vite 5173)
  dan mobile Tauri (1420). Origin di luar daftar tetap tidak mendapat header
  CORS. Jangan pakai `*`: middleware mengirim `credentials: true`, dan wildcard
  tidak sah untuk itu.

  Pencocokan bersifat **persis** (`includes`), tanpa wildcard. Artinya URL
  _preview deployment_ Vercel (`taslim-admin-git-<branch>-<user>.vercel.app`)
  **tidak** diizinkan; uji di domain produksi, atau tambahkan URL preview
  spesifik ke `CORS_ORIGINS` kalau memang perlu.

- `TRUST_PROXY` **disuntik pipeline** (`TRUST_PROXY=1`) kalau tidak ada di
  `.env`, karena topologi di compose selalu Caddy → backend. Tanpa ini
  `express-rate-limit` memakai IP Caddy untuk semua klien, sehingga **satu
  pengunjung bisa mengunci login semua orang**. Set nilai lain hanya kalau hop
  proxy-nya berbeda.

- Direktori `/home/taslim/deploy` (lihat `SERVER_DIR` di workflow). Runner
  membuatnya sendiri (`mkdir -p`) dan user runner harus bisa menulis ke sana,
  karena pipeline menulis `.env`, `docker-compose.yml`, `Caddyfile`, dan
  `backups/`.

Yang **tidak** perlu disiapkan manual di server: `docker-compose.yml` dan
`Caddyfile` disalin dari repo setiap deploy. Jadi perubahan compose/Caddy ikut
ter-deploy, dan server baru cukup punya Docker + runner terpasang.

Yang **tetap** milik server dan tidak disentuh pipeline: `.env` dan `backups/`.
Artinya mengubah `CORS_ORIGINS` atau kredensial kini dilakukan di `.env` server
(atau lewat secret `ENV_FILE_B64` hanya saat host benar-benar baru).

Pipeline juga menuliskan `IMAGE_TAG` ke `.env` setiap deploy, sehingga
`docker compose up -d` manual di server memakai versi yang sedang dirilis —
bukan `latest` yang bisa saja lebih baru. Bersihkan image lama dengan
`docker image prune` yang **difilter** label
`org.opencontainers.image.source=<repo>`: tanpa filter, cache image aplikasi
lain di host yang sama ikut terhapus.

> Catatan: file di server yang tidak ada di repo (mis. `.env`, `backups/`)
> tidak tersentuh. Tapi perubahan manual pada `docker-compose.yml`/`Caddyfile`
> di server akan **tertimpa** — ubah di repo, bukan langsung di server.

## Rollback

Dua lapis:

1. **Otomatis.** Kalau langkah setelah trap gagal (pull, backup, migrasi,
   `up --wait`, health check, smoke test), skrip memulihkan `IMAGE_TAG` di
   `.env` ke tag sebelumnya lalu menjalankan `docker compose up -d --no-deps
backend`. Log 80 baris terakhir container ikut dicetak ke job log.
2. **Manual**, kalau rollback otomatis tidak cukup (mis. DB perlu dipulihkan):

```bash
cd /home/taslim/deploy
IMAGE_TAG=sha-<commit-lama> docker compose pull backend
IMAGE_TAG=sha-<commit-lama> docker compose up -d --force-recreate backend
```

Tag `sha-<commit>` **immutable**, jadi tag lama tetap menunjuk commit lama
walaupun `latest` sudah bergerak. Migrasi tidak otomatis dibalik: kalau rilis
bermasalah karena migrasi, restore dari `backups/` (lihat bawah) sebelum
menjalankan image lama.

## Seed data awal

`prisma/seeder.js` **mengosongkan seluruh tabel** lalu membuat user admin.
Password tidak lagi tertulis di repo (repo publik) — wajib lewat env:

```bash
docker compose exec -T -e SEED_ADMIN_PASSWORD='<password-kuat>' \
  backend node prisma/seeder.js
```

- `SEED_ADMIN_PASSWORD` wajib, minimal 12 karakter; skrip gagal **sebelum**
  menyentuh database kalau tidak valid.
- `SEED_ADMIN_USERNAME` opsional (default `admin`).
- Data demo terpisah: `npm run seed:demo`.

## Backup & restore

Pipeline menyimpan dump di `backups/db-<timestamp>.sql`, menghapus yang lebih
tua dari 7 hari, dan **menganggap backup gagal kalau ukurannya < 1 KB** — dump
kosong tidak pernah lolos diam-diam. Nama database dibaca dari `MYSQL_DATABASE`
di container, bukan di-hardcode.

```bash
# backup manual
docker compose exec -T mariadb \
  sh -c 'exec mariadb-dump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction "$MYSQL_DATABASE"' \
  > backups/manual.sql

# restore
docker compose exec -T mariadb \
  sh -c 'exec mariadb -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < backups/manual.sql
```

Backup masih berada di host yang sama. Untuk produksi, salin juga ke luar server
(S3/rsync).

## Rotasi kredensial

Kredensial lama pernah tersimpan di git, jadi dianggap bocor.

MariaDB — mengubah `MYSQL_*` di `.env` **tidak** mengubah password user yang
sudah ada (env hanya dipakai saat inisialisasi volume). Urutannya:

```bash
# 1. ganti password di dalam DB dulu
docker compose exec mariadb mariadb -uroot -p'<root-lama>' -e \
  "ALTER USER 'admin'@'%' IDENTIFIED BY '<baru>'; ALTER USER 'root'@'localhost' IDENTIFIED BY '<root-baru>'; FLUSH PRIVILEGES;"

# 2. baru perbarui .env, lalu
docker compose up -d
```

RustFS — kredensial dibaca dari env setiap start, tidak ada state di volume:

```bash
# perbarui STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY di .env, lalu
docker compose up -d rustfs
```

Catatan: mengganti kredensial **tidak** menghapus objek yang sudah ada; bucket
dan policy-nya tersimpan di volume `rustfs_data`. Setelah ganti kredensial,
upload baru tetap jalan tetapi URL publik lama tidak terpengaruh (akses publik
lewat bucket policy, bukan signed URL).

Catatan: `DATABASE_URL` backend dirangkai dari `MYSQL_USER`/`MYSQL_PASSWORD`,
jadi password harus URL-safe (hindari `@ : / ? #`).

## Dokumen BAST (volume uploads)

`pdf.service.js` menulis PDF ke `/app/public/uploads/documents` di dalam
container. Volume `uploads_data` menjaga file tetap ada saat container
di-recreate. **File yang dibuat sebelum volume ini dipasang masih berada di
layer container lama** — salin dulu sebelum deploy berikutnya:

```bash
docker cp backend:/app/public/uploads/. /tmp/uploads-lama/
# setelah container baru jalan:
docker cp /tmp/uploads-lama/. backend:/app/public/uploads/
```

## Object storage (RustFS)

Server-nya **RustFS** (`rustfs/rustfs:1.0.4`), S3-compatible. Kode memakai SDK S3
standar (`@aws-sdk/client-s3`) dan variabel `STORAGE_*`, sehingga tidak terikat
pada satu implementasi object storage.

| Env                                         | Keterangan                                        |
| ------------------------------------------- | ------------------------------------------------- |
| `STORAGE_ENDPOINT`                          | `rustfs` di dalam compose, `localhost` untuk dev  |
| `STORAGE_PORT`                              | 9000                                              |
| `STORAGE_USE_SSL`                           | `false` (TLS ditangani Caddy di depan)            |
| `STORAGE_REGION`                            | `us-east-1` (RustFS mengabaikan, SDK tetap butuh) |
| `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` | **wajib**; production menolak start bila kosong   |
| `STORAGE_BUCKET`                            | `arxiva-images`                                   |
| `STORAGE_PUBLIC_URL`                        | base URL publik, tanpa nama bucket                |

Terverifikasi end-to-end terhadap kode aplikasi: `HeadBucket`, `CreateBucket`,
`PutBucketPolicy` (public-read), `PutObject`, dan anonymous GET via Caddy.

### Migrasi dari variabel `MINIO_*`

`.env` produksi masih memakai nama lama. Tanpa langkah ini backend gagal start
di production (`STORAGE_ACCESS_KEY & STORAGE_SECRET_KEY wajib diset`).

```bash
cd /home/taslim/deploy
sed -i \
  -e 's/^MINIO_ENDPOINT=/STORAGE_ENDPOINT=/' \
  -e 's/^MINIO_PORT=/STORAGE_PORT=/' \
  -e 's/^MINIO_USE_SSL=/STORAGE_USE_SSL=/' \
  -e 's/^MINIO_ACCESS_KEY=/STORAGE_ACCESS_KEY=/' \
  -e 's/^MINIO_SECRET_KEY=/STORAGE_SECRET_KEY=/' \
  -e 's/^MINIO_BUCKET=/STORAGE_BUCKET=/' \
  -e 's/^MINIO_PUBLIC_URL=/STORAGE_PUBLIC_URL=/' \
  .env
grep -q '^STORAGE_REGION=' .env || echo "STORAGE_REGION=us-east-1" >> .env
```

Lalu sesuaikan juga secret GitHub `ENV_FILE_B64` (`base64 -w0 .env`) — hanya
relevan kalau `.env` server nanti dibangun ulang dari nol.

### Path publik: `/minio/` → `/storage/`

`STORAGE_PUBLIC_URL` menentukan URL yang **disimpan di DB** untuk foto baru, dan
Caddyfile sekarang mem-proxy `/storage/*`. Path lama tidak dipertahankan, jadi
URL lama harus ikut di-rewrite:

```sql
-- cek dulu berapa baris terdampak
SELECT COUNT(*) FROM ReconRecord WHERE imageUrl LIKE '%/minio/%';

UPDATE ReconRecord
SET imageUrl = REPLACE(imageUrl, '/minio/', '/storage/')
WHERE imageUrl LIKE '%/minio/%';
```

Kolom lain yang menyimpan URL gambar mengikuti pola yang sama.

### Konsol admin

Konsol RustFS ada di `127.0.0.1:9001` (hanya loopback). Akses via tunnel:

```bash
ssh -L 9001:127.0.0.1:9001 <user>@<host>   # lalu buka http://localhost:9001
```

Catatan keamanan: RustFS 1.0.4 belum punya rekam jejak sepanjang alternatif
lainnya. Kalau ada keraguan, jangan ekspos konsol ke internet dan pin versi
seperti sekarang.
