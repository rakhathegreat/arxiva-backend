# Deployment

Pipeline: `.github/workflows/deploy.yml` (push ke `main` atau `workflow_dispatch`).

```
ci (lint + unit + integration)  →  build & push image :sha-<commit> + :latest
                                     →  SSH ke server:
                                        1. tulis .env dari secret ENV_FILE_B64
                                        2. pull image (tag = sha-<commit>)
                                        3. tunggu MariaDB siap
                                        4. backup DB ke backups/
                                        5. prisma migrate deploy
                                        6. docker compose up -d --wait
                                        7. cek /health, gagal = job merah
```

Deploy berhenti di langkah mana pun yang gagal (`set -euo pipefail` +
`script_stop: true`), jadi image baru tidak akan jalan di atas skema lama.

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

- Docker Compose **>= 2.20** (`--wait`, `--wait-timeout`): `docker compose version`.
- `.env` produksi memuat `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`,
  `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` — compose menolak start kalau kosong.
- Direktori `/home/taslim/arxiva-backend` (lihat `SERVER_DIR` di workflow)
  writable oleh user deploy, karena pipeline menulis `.env`, `backups/`.

## Rollback

Image sekarang di-tag `sha-<commit>` (immutable):

```bash
cd /home/taslim/arxiva-backend
IMAGE_TAG=sha-<commit-lama> docker compose pull backend
IMAGE_TAG=sha-<commit-lama> docker compose up -d --force-recreate backend
```

Migrasi tidak otomatis dibalik. Kalau rilis bermasalah karena migrasi, restore
dari `backups/` (lihat bawah) sebelum menjalankan image lama.

## Backup & restore

Pipeline menyimpan dump harian-ish di `backups/arxiva-<timestamp>.sql` dan
menghapus yang lebih tua dari 7 hari.

```bash
# backup manual
docker compose exec -T mariadb \
  sh -c 'exec mariadb-dump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction arxiva' \
  > backups/arxiva-manual.sql

# restore
docker compose exec -T mariadb \
  sh -c 'exec mariadb -uroot -p"$MYSQL_ROOT_PASSWORD" arxiva' < backups/arxiva-manual.sql
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
cd /home/taslim/arxiva-backend
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
