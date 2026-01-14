# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY web/package*.json web/
COPY server/package*.json server/
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY web/ web/
COPY server/ server/

# Build frontend
RUN cd web && npm run build

# Build backend
RUN npm run build:server

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy built files
COPY --from=builder /app/web/dist web/dist
COPY --from=builder /app/dist/server server
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/package.json .

# Copy data directory structure
RUN mkdir -p data

# Create startup script
RUN echo '#!/bin/sh\nnode server/index.js' > /app/start.sh && chmod +x /app/start.sh

EXPOSE 12306
VOLUME /data
CMD ["/app/start.sh"]
