# syntax=docker/dockerfile:1

# ---------- build stage ----------
FROM oven/bun:1 AS build
WORKDIR /app

# install deps (cached layer)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# build static site
COPY . .
RUN bun run build

# ---------- serve stage ----------
FROM nginx:1.27-alpine AS serve
RUN rm -rf /usr/share/nginx/html/*
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
