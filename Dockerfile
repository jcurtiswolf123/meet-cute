# Meet Cute on Fly.io: single container, SQLite on a persistent volume so
# member writes (opt-ins, slot picks, notes) survive restarts.
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
ARG SENTRY_AUTH_TOKEN
ENV SENTRY_DSN=$SENTRY_DSN \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    SENTRY_ORG=$SENTRY_ORG \
    SENTRY_PROJECT=$SENTRY_PROJECT \
    SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npx next build

FROM base AS run
ENV NODE_ENV=production
ENV PORT=3009
COPY --from=build /app ./
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 3009
CMD ["./docker-entrypoint.sh"]
