# syntax=docker/dockerfile:1

# Mutuals on Fly.io. Runtime data lives in Neon Postgres.
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
# Identifies this build to the browser so a page held from an earlier deploy is
# a detectable mismatch rather than a silent one. See next.config.mjs. Passed by
# the deploy job as the commit SHA; empty is the old behaviour and builds fine.
ARG NEXT_DEPLOYMENT_ID=""
ENV SENTRY_DSN=$SENTRY_DSN \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    SENTRY_ORG=$SENTRY_ORG \
    SENTRY_PROJECT=$SENTRY_PROJECT \
    NEXT_DEPLOYMENT_ID=$NEXT_DEPLOYMENT_ID
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_SERVER_ACTIONS_ENCRYPTION_KEY is what keeps server action ids the same
# from one build to the next. Left unset, Next generates a random key per build
# and every single action id changes, so every page anyone is currently holding
# stops working the moment we deploy: measured at 58 of 58 ids changing between
# two builds of identical source. It is a real secret (it encrypts bound
# arguments that cross to the client), so it arrives as a BuildKit secret rather
# than a build arg and never lands in an image layer or `docker history`.
#
# Build time only. Next writes the key into
# .next/server/server-reference-manifest.json and the running server reads it
# from there, so there is no runtime env var and no Fly secret to keep in sync.
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN \
    --mount=type=secret,id=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
    if [ -f /run/secrets/SENTRY_AUTH_TOKEN ]; then \
      export SENTRY_AUTH_TOKEN="$(cat /run/secrets/SENTRY_AUTH_TOKEN)"; \
    fi \
    && if [ -f /run/secrets/NEXT_SERVER_ACTIONS_ENCRYPTION_KEY ]; then \
      export NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$(cat /run/secrets/NEXT_SERVER_ACTIONS_ENCRYPTION_KEY)"; \
    else \
      echo "[build] WARNING: no NEXT_SERVER_ACTIONS_ENCRYPTION_KEY. Server action ids will be random for this build, so every page loaded from the previous deploy will break on its next submit."; \
    fi \
    && npx prisma generate \
    && npx next build

FROM base AS run
# Re-declared because a build ARG does not cross stages. The standalone server
# reads the id baked into the build, so this only keeps the runtime environment
# saying the same thing as the bundle rather than nothing at all.
ARG NEXT_DEPLOYMENT_ID=""
ENV NODE_ENV=production
ENV PORT=3009
ENV HOSTNAME=0.0.0.0
ENV NEXT_DEPLOYMENT_ID=$NEXT_DEPLOYMENT_ID
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
