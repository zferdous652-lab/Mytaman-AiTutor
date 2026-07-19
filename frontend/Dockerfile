# ---------- Build stage ----------
# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder

WORKDIR /app

# Same-origin API calls: the nginx layer proxies /api to backend, so the
# frontend can leave REACT_APP_BACKEND_URL empty (calls resolve to /api/*).
ARG REACT_APP_BACKEND_URL=""
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

# Install dependencies with the exact lockfile
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 600000

# Copy source + build
COPY . .
RUN yarn build

# ---------- Runtime stage ----------
FROM nginx:1.27-alpine

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/app.conf
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
