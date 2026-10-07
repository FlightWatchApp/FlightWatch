# syntax=docker/dockerfile:1
#
# SPEC-028 — uma imagem para os seis processos e as migrações, um target por
# processo: docker build --target api -t flight-watch-api .
#
# Debian slim (não Alpine): os binários do Prisma e do Argon2 não dependem de
# musl. Node 24, igual ao .nvmrc.

FROM node:24-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm \
  PATH=/pnpm:$PATH \
  NEXT_TELEMETRY_DISABLED=1 \
  TURBO_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# Dependências só a partir do lockfile: a camada é reaproveitada enquanto o
# lockfile não muda, mesmo com o código mudando.
FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch --frozen-lockfile
COPY . .
RUN pnpm install --frozen-lockfile --offline \
  && pnpm build

# Runtime: sem pnpm/corepack no caminho de execução (nada é baixado ao subir).
# Leva a instalação completa — o CLI do Prisma, usado por `migrate`, é
# devDependency (SPEC-028, questões em aberto).
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app /app
USER node

FROM runtime AS migrate
WORKDIR /app/packages/database
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

FROM runtime AS api
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]

FROM runtime AS scheduler
CMD ["node", "apps/scheduler/dist/main.js"]

FROM runtime AS price-worker
CMD ["node", "apps/price-worker/dist/main.js"]

FROM runtime AS alert-worker
CMD ["node", "apps/alert-worker/dist/main.js"]

FROM runtime AS notification-worker
CMD ["node", "apps/notification-worker/dist/main.js"]

FROM runtime AS web
WORKDIR /app/apps/web
EXPOSE 3100
CMD ["sh", "-c", "exec ./node_modules/.bin/next start --port ${PORT:-3100}"]
