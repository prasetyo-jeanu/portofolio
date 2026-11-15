FROM oven/bun:1.3-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json ./
RUN bun install --no-save

# Copy application source
COPY . .

# Create persistent volume mount points and initial empty content dirs
RUN mkdir -p /data/uploads /data/backups .generated-content/blog .generated-content/projects

# Build initial Astro server + static public bundle (without requiring runtime DB yet)
ENV NODE_ENV=production
ENV DATABASE_PATH=/data/portfolio.db
ENV UPLOAD_DIR=/data/uploads
ENV PUBLIC_DIST_DIR=/app/dist-public

RUN bun --bun astro build && bunx pagefind --site dist/client && cp -r dist/client /app/dist-public

EXPOSE 4321

CMD ["sh", "-c", "bun run scripts/migrate.ts && bun run scripts/seed.ts && bun run server/entrypoint.ts"]
