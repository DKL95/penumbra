# =========================================================
# PENUMBRA — imagen para hostear (Render, Railway, Fly.io…)
# Un solo contenedor: Node (juego + multijugador WebSocket)
# que a su vez arranca PHP (servicio web /api). MySQL va
# aparte (el servicio de MySQL de la plataforma) y se
# configura con variables de entorno: DB_HOST, DB_PORT,
# DB_NAME, DB_USER, DB_PASS (o las MYSQL* de Railway) y
# FACEBOOK_APP_ID / FACEBOOK_APP_SECRET.
# =========================================================
FROM node:20-bookworm-slim

# PHP 8.2 de Debian con PDO MySQL, cURL (Graph API de Facebook) y mbstring
RUN apt-get update \
 && apt-get install -y --no-install-recommends php-cli php-mysql php-curl php-mbstring ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .

ENV NODE_ENV=production PORT=8777
EXPOSE 8777
CMD ["node", "server.js"]
