FROM oven/bun:1.3-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json ./
RUN bun install --no-save

# Copy application source
COPY . .

# Build Astro SSR server + static bundle → store bootstrap copy in image layer
ENV NODE_ENV=production
ENV DATABASE_PATH=/data/portfolio.db
ENV UPLOAD_DIR=/data/uploads
ENV PUBLIC_DIST_DIR=/data/dist-public

RUN bun --bun astro build && \
    bunx pagefind --site dist/client && \
    cp -r dist/client/. /app/dist-bootstrap/

EXPOSE 4321

# On startup:
#   1. Ensure volume subdirs exist
#   2. Copy bootstrap static ONLY if /data/dist-public is empty/missing (first boot)
#   3. Run DB migrations (idempotent) + seed admin (idempotent)
#   4. Start server
CMD ["sh", "-c", "\
  mkdir -p /data/uploads /data/backups && \
  if [ ! -d /data/dist-public ] || [ -z \"$(ls -A /data/dist-public 2>/dev/null)\" ]; then \
    echo 'First boot: copying bootstrap static site to /data/dist-public' && \
    cp -r /app/dist-bootstrap/. /data/dist-public/; \
  else \
    echo 'Existing /data/dist-public found — skipping bootstrap copy'; \
  fi && \
  bun run scripts/migrate.ts && \
  bun run scripts/seed.ts && \
  bun run server/entrypoint.ts \
"]
