FROM node:24-slim AS base
WORKDIR /app

FROM base AS deps
COPY --from=oven/bun:1.3.14 /usr/local/bin/bun /usr/local/bin/bun
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN bun run build \
 && bun build src/server.ts --target=node --outfile=dist/server.mjs \
 && bun build src/worker.ts --target=node --outfile=dist/worker.mjs \
 && bun build src/migrate.ts --target=node --outfile=dist/migrate.mjs \
 && bun build src/create-user.ts --target=node --outfile=dist/create-user.mjs

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIR=/app/web \
    MIGRATIONS_FOLDER=/app/migrations \
    STORAGE_DIR=/app/data/files
COPY --from=build --chown=node:node /app/dist/web ./web
COPY --from=build --chown=node:node /app/dist/server.mjs ./server.mjs
COPY --from=build --chown=node:node /app/dist/worker.mjs ./worker.mjs
COPY --from=build --chown=node:node /app/dist/migrate.mjs ./migrate.mjs
COPY --from=build --chown=node:node /app/dist/create-user.mjs ./create-user.mjs
COPY --from=build --chown=node:node /app/src/server/shared/database/migrations ./migrations
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
