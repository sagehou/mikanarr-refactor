FROM node:22.23.1-alpine3.24

WORKDIR /app

COPY package*.json .npmrc ./
RUN npm install --global --ignore-scripts npm@11.18.0 \
    && test "$(npm --version)" = "11.18.0" \
    && npm ci --omit=dev

COPY public ./public
COPY server ./server

RUN mkdir -p /app/data && chown -R node:node /app/data

ENV NODE_ENV=production
ENV PORT=12306

EXPOSE 12306

USER node

HEALTHCHECK --interval=5s --timeout=5s --start-period=10s --retries=3 CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:12306/api/health || exit 1

CMD ["node", "server/index.js"]
