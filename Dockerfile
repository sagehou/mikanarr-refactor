FROM node:24.22.2-alpine3.24@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85

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
