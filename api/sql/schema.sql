-- =========================================================
-- PENUMBRA — Esquema de la base de datos (MySQL 8)
-- El servicio web lo ejecuta solo la primera vez (api/lib/db.php),
-- pero también puede correrse a mano desde MySQL Workbench:
--   CREATE DATABASE penumbra CHARACTER SET utf8mb4; USE penumbra;
-- =========================================================

-- Jugadores: con Facebook (proveedor = 'facebook') o invitados ('invitado')
CREATE TABLE IF NOT EXISTS usuarios (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  proveedor      VARCHAR(20)  NOT NULL,
  proveedor_id   VARCHAR(64)  NOT NULL,
  nombre         VARCHAR(60)  NOT NULL,
  foto           VARCHAR(500) NULL,
  creado         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_acceso  DATETIME     NULL,
  UNIQUE KEY uq_proveedor (proveedor, proveedor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Sesiones abiertas (token que el juego manda en cada petición)
CREATE TABLE IF NOT EXISTS sesiones (
  token       CHAR(48) PRIMARY KEY,
  usuario_id  INT      NOT NULL,
  creado      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sesion_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Puntajes de cada partida terminada
CREATE TABLE IF NOT EXISTS puntajes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT         NOT NULL,
  modo        VARCHAR(12) NOT NULL,                 -- escape | survival | versus
  escenario   VARCHAR(12) NOT NULL,                 -- campaign | mansion | hospital | forest
  dificultad  VARCHAR(10) NOT NULL,                 -- normal | dark | blackout
  rol         VARCHAR(10) NOT NULL DEFAULT 'survivor',
  resultado   VARCHAR(10) NOT NULL,                 -- escaped | caught | won | lost
  puntos      INT         NOT NULL,
  segundos    INT         NOT NULL,
  reliquias   INT         NOT NULL DEFAULT 0,
  creado      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_puntos (modo, puntos),
  CONSTRAINT fk_puntaje_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Personalización del jugador (colores, linterna y accesorio). Una fila por usuario;
-- `datos` es un JSON con ids de las opciones de Rules.LOOK (js/rules.js), validados en PHP.
CREATE TABLE IF NOT EXISTS personalizacion (
  usuario_id   INT          PRIMARY KEY,
  datos        VARCHAR(400) NOT NULL,
  actualizado  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_personalizacion_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
