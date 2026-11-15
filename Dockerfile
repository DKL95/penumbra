# =========================================================
# PENUMBRA — imagen para hostear (Render)
# Un solo contenedor con todo:
#   · Node: juego + multijugador WebSocket (server.js)
#   · PHP: servicio web /api (lo arranca server.js)
#   · MariaDB (MySQL): base de datos local (la arranca start.sh)
# Si se define DATABASE_URL o DB_HOST se usa esa base externa
# y no se levanta MariaDB.
# =========================================================
FROM node:20-bookworm-slim

# PHP 8.2 con PDO MySQL, cURL (Graph API de Facebook) y mbstring + MariaDB
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      php-cli php-mysql php-curl php-mbstring ca-certificates mariadb-server \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .

ENV NODE_ENV=production PORT=8777
EXPOSE 8777
CMD ["sh", "/app/start.sh"]
