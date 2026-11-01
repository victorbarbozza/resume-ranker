FROM node:24-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY --from=oven/bun:1.3.14 /usr/local/bin/bun /usr/local/bin/bun
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN bun run build \
 && bun build src/worker.ts --target=node --outfile=dist/worker.mjs \
 && bun build src/migrate.ts --target=node --outfile=dist/migrate.mjs

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MIGRATIONS_FOLDER=/app/migrations
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/src/server/shared/database/migrations ./migrations
COPY --from=build --chown=node:node /app/dist/worker.mjs ./worker.mjs
COPY --from=build --chown=node:node /app/dist/migrate.mjs ./migrate.mjs
USER node
EXPOSE 3000
CMD ["node", "server.js"]
