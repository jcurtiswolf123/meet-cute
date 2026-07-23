# syntax=docker/dockerfile:1

# Meet Cute on Fly.io. Runtime data lives in Neon Postgres.
FROM node:22-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
# Sentry needs its config at BUILD time: NEXT_PUBLIC_SENTRY_DSN is inlined into
# the client bundle, and withSentryConfig uploads source maps with the auth token.
# Passed via `fly deploy --build-arg ...`. All no-ops when empty (the prior build).
ARG SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_DSN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ENV SENTRY_DSN=$SENTRY_DSN \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    SENTRY_ORG=$SENTRY_ORG \
    SENTRY_PROJECT=$SENTRY_PROJECT
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN \
    if [ -f /run/secrets/SENTRY_AUTH_TOKEN ]; then \
      export SENTRY_AUTH_TOKEN="$(cat /run/secrets/SENTRY_AUTH_TOKEN)"; \
    fi \
    && npx prisma generate \
    && npx next build

FROM base AS run
ENV NODE_ENV=production
ENV PORT=3009
ENV HOSTNAME=0.0.0.0
COPY --chown=node:node --from=build /app/.next/standalone ./
COPY --chown=node:node --from=build /app/.next/static ./.next/static
COPY --chown=node:node --from=build /app/public ./public
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh \
    && mkdir -p /data/uploads \
    && chown -R node:node /data
USER node
EXPOSE 3009
CMD ["./docker-entrypoint.sh"]
