# Deployment

Pipeline: `.github/workflows/deploy.yml` (push ke `main` atau `workflow_dispatch`).

```
ci (lint + unit + integration)          ← reusable: .github/workflows/ci.yml
  → build & push image :sha-<commit> + :latest
      → SSH ke server:
         0. siapkan direktori + cek docker/compose/curl (SEBELUM build)
         1. salin docker-compose.yml + Caddyfile
         2. tulis .env dari secret ENV_FILE_B64
         3. recreate rustfs (kredensial dibaca ulang dari env)
         4. pull image (tag = sha-<commit>)
         5. tunggu MariaDB siap
         6. backup DB ke backups/db-<timestamp>.sql
         7. prisma migrate deploy
         8. docker compose up -d --remove-orphans --wait
         9. cek /health dari dalam container
        10. smoke test lewat domain publik (Caddy + TLS ikut terbukti)
```

`main` **tidak** memicu `ci.yml` sendiri: gate kualitasnya datang dari
`workflow_call` di Deploy, supaya commit yang sama tidak divalidasi dua kali.
Job `docker` (build tanpa push) tetap jalan di PR dan push ke `development`, tapi
dimatikan saat dipanggil Deploy (`build_image: false`) karena Deploy memang
membangun image yang sama beberapa langkah kemudian.

Semua langkah memakai `set -euo pipefail` + `script_stop: true`. Kalau ada
langkah yang gagal setelah trap dipasang, deploy **rollback otomatis** ke tag
`sha-*` sebelumnya.

## Secret GitHub yang dibutuhkan

| Secret               | Wajib               | Isi                                     |
| -------------------- | ------------------- | --------------------------------------- |
| `SERVER_HOST`        | ya                  | IP/hostname VPS                         |
| `SERVER_USER`        | ya                  | user SSH untuk deploy                   |
| `SERVER_KEY`         | ya                  | private key SSH (tanpa passphrase)      |
| `ENV_FILE_B64`       | ya                  | isi file `.env` produksi, **di-base64** |
| `GHCR_TOKEN`         | jika package privat | PAT dengan scope `read:packages`        |
| `SERVER_FINGERPRINT` | disarankan          | `ssh-keyscan -t ed25519 <host>`         |

Membuat `ENV_FILE_B64`:

```bash
base64 -w0 .env   # salin seluruh output, tempel sebagai nilai secret
```

`ENV_FILE_B64` dikirim sebagai environment variable lalu di-decode di server,
bukan diinterpolasi ke dalam teks skrip. Jadi password berisi `$`, backtick,
atau baris `EOF` tidak akan merusak `.env`.

Environment GitHub `production` dipakai job deploy (bisa diberi required
reviewer). Job gagal kalau environment belum dibuat? Tidak — environment dibuat
otomatis, tapi tanpa reviewer sampai dikonfigurasi.

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
  Untuk menjalankan aplikasi desktop dengan `npm run tauri dev` melawan API
  production:

  ```
  CORS_ORIGINS=http://localhost:1420,http://127.0.0.1:1420,http://localhost:1421,http://127.0.0.1:1421
  ```

  Origin di luar daftar tetap tidak mendapat header CORS. Jangan pakai `*`:
  middleware mengirim `credentials: true`, dan wildcard tidak sah untuk itu.

- `TRUST_PROXY` **disuntik pipeline** (`TRUST_PROXY=1`) kalau tidak ada di
  `ENV_FILE_B64`, karena topologi di compose selalu Caddy → backend. Tanpa ini
  `express-rate-limit` memakai IP Caddy untuk semua klien, sehingga **satu
  pengunjung bisa mengunci login semua orang**. Set nilai lain hanya kalau hop
  proxy-nya berbeda.

- Direktori `/home/taslim/deploy` (lihat `SERVER_DIR` di workflow). Pipeline
  membuatnya sendiri (`mkdir -p`) dan user deploy harus bisa menulis ke sana,
  karena pipeline menulis `.env` dan `backups/`.

Yang **tidak** perlu disiapkan manual di server: `docker-compose.yml` dan
`Caddyfile` disalin dari repo setiap deploy (langkah "Sync stack config").
Jadi perubahan compose/Caddy ikut ter-deploy, dan server baru cukup punya
Docker + user SSH.

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

# 2. baru perbarui .env (dan secret ENV_FILE_B64), lalu
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

Lalu perbarui secret GitHub `ENV_FILE_B64` (`base64 -w0 .env`) sebelum deploy
berikutnya.

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
