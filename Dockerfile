FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY public ./public
COPY server ./server

# Create data directory
RUN mkdir -p data

EXPOSE 12306

ENV PORT=12306
ENV NODE_ENV=production

CMD ["npm", "start"]
