#!/bin/sh
# =========================================================
# PENUMBRA — arranque del contenedor
# Si no se configuró una base externa (DATABASE_URL / DB_HOST),
# levanta un MariaDB (MySQL) local dentro del mismo contenedor,
# crea la base "penumbra" y un usuario con contraseña aleatoria,
# y luego arranca el juego (Node + PHP).
# OJO: en el plan gratis de Render el disco no es persistente:
# los puntajes se pierden cuando el servicio se duerme o se
# vuelve a desplegar.
# =========================================================
set -e

if [ -z "$DATABASE_URL" ] && [ -z "$MYSQL_URL" ] && [ -z "$DB_HOST" ]; then
  DATADIR=/var/lib/mysql
  mkdir -p /run/mysqld "$DATADIR"
  chown -R mysql:mysql /run/mysqld "$DATADIR"
  if [ ! -d "$DATADIR/mysql" ]; then
    mariadb-install-db --user=mysql --datadir="$DATADIR" --skip-test-db --auth-root-authentication-method=socket > /dev/null
  fi

  # configuración mínima para caber en los 512 MB del plan gratis
  mariadbd --user=mysql --datadir="$DATADIR" --bind-address=127.0.0.1 --port=3306 \
    --skip-name-resolve --performance-schema=OFF --max-connections=30 \
    --innodb-buffer-pool-size=16M --innodb-log-buffer-size=1M --key-buffer-size=1M \
    --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci &

  i=0
  until mariadb-admin --protocol=socket ping --silent 2> /dev/null; do
    i=$((i + 1))
    if [ "$i" -gt 60 ]; then echo "MariaDB no arrancó" >&2; exit 1; fi
    sleep 1
  done

  DB_PASS=${DB_PASS:-$(head -c 18 /dev/urandom | od -An -tx1 | tr -d ' \n')}
  mariadb --protocol=socket -uroot <<SQL
CREATE DATABASE IF NOT EXISTS penumbra CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'penumbra'@'127.0.0.1' IDENTIFIED BY '$DB_PASS';
ALTER USER 'penumbra'@'127.0.0.1' IDENTIFIED BY '$DB_PASS';
GRANT ALL PRIVILEGES ON penumbra.* TO 'penumbra'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
  export DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=penumbra DB_USER=penumbra DB_PASS
  echo "MariaDB local listo (base penumbra)"
fi

exec node server.js
