FROM node:22-alpine AS deps

WORKDIR /app

# `npm ci` mengikuti package-lock.json (reproducible), bukan `npm install`
# yang bisa menghasilkan dependency tree berbeda dengan yang dites di CI.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev


FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node src ./src
COPY --chown=node:node assets ./assets
COPY --chown=node:node app.js ./

# Client Prisma digenerate saat build (butuh CLI prisma, tersedia karena
# `prisma` ada di dependencies). Direktori upload dibuat di sini supaya
# proses runtime sebagai user non-root tidak perlu menulis ke /app.
RUN npx prisma generate \
    && mkdir -p public/uploads/documents \
    && chown -R node:node /app/public

# Jangan jalan sebagai root.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Migrasi TIDAK dijalankan di sini: `prisma migrate deploy` dijalankan sekali
# oleh pipeline sebelum container baru di-up, agar restart/crash-loop tidak
# memicu migrasi yang tidak diinginkan.
# Langsung `node`, tanpa perantara npm/sh, supaya SIGTERM dari `docker stop`
# sampai ke app.js dan shutdown rapi (tutup koneksi Prisma) benar-benar jalan.
CMD ["node", "app.js"]
