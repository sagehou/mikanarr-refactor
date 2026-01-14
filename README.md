# Mikanarr Refactor

Modern rewrite of Mikanarr - bridge between Mikan Anime and Sonarr.

## Features

- Modern React 18 with Vite and Tailwind CSS
- SQLite database (better-sqlite3)
- JWT authentication
- RSS transformation for Sonarr
- Beautiful, responsive UI

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev:server & npm run dev:web

# Build for production
npm run build

# Run production
npm start
```

## Docker

```bash
docker build -t mikanarr .
docker run -v ./data:/data -p 12306:12306 mikanarr
```

## Environment Variables

See `.env.example` for configuration.

## License

ISC
