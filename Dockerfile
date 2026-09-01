FROM node:26.8.1-alpine3.24@sha256:2d984a15c9b54fd0aeb608b8e0d0d83529eb34d2966db27a1fb4f1edc3d298a3

WORKDIR /app

COPY package*.json .npmrc ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm install --global --ignore-scripts npm@11.18.0 \
    && test "$(npm --version)" = "11.18.0" \
    && npm ci --omit=dev \
    && apk del .build-deps

COPY public ./public
COPY server ./server

RUN mkdir -p /app/data && chown -R node:node /app/data

ENV NODE_ENV=production
ENV PORT=12306

EXPOSE 12306

USER node

HEALTHCHECK --interval=5s --timeout=5s --start-period=10s --retries=3 CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:12306/api/health || exit 1

CMD ["node", "server/index.js"]
