FROM node:22-bookworm-slim

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

COPY . .
RUN pnpm install --frozen-lockfile --filter worker... \
    && pnpm --filter @albion/db build

CMD ["node", "--import", "tsx", "apps/worker/src/index.ts"]
