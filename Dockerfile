# syntax=docker/dockerfile:1
#
# Babin Rentals OS — multi-stage: Node builds the bundle, nginx serves it.
# The runtime image contains no Node, no node_modules and no source.
#
#   docker build \
#     --build-arg VITE_SUPABASE_URL=https://<project>.supabase.co \
#     --build-arg VITE_SUPABASE_ANON_KEY=<anon key> \
#     -t babin-rentals-os .
#
#   docker run --rm -p 8080:80 babin-rentals-os
#
# See README.md § Deployment. No credentials are baked into this file.

# ── stage 1 · build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# Vite reads VITE_* at BUILD time and inlines the values into the JavaScript.
# They are not runtime configuration: a container started without them was
# already built without them, and will talk to no database no matter what the
# environment says. That also means every one of them is PUBLIC — the anon key
# ships inside the bundle every visitor downloads. That is the intended design
# (Row Level Security is the enforcement layer), but it makes a service key
# here a complete authorization bypass. Never pass one.
#
# Build args land in the image's layer history, so treat them as public too.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SENTRY_DSN=""
ARG VITE_APP_VERSION=""

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_APP_VERSION=$VITE_APP_VERSION

# Manifests first so `npm ci` is only re-run when dependencies actually change.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# `npm run build` is `tsc --noEmit && vite build` — a type error fails the image
# rather than producing one that merely starts. Emits dist/index.html (the ops
# app) and dist/marketing.html (the public site) from two Rollup entry points.
RUN npm run build

# ── stage 2 · serve ──────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS serve

# Carries the SPA rewrite. Without it every deep link 404s — see nginx.conf.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
