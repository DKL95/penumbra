# PENUMBRA — Escape Room de Terror

Proyecto de la UA **Gráficas Computacionales en Web** · Grupo 051 · Ago–Dic 2026

Escape room de terror en WebGL (Three.js). El superviviente recorre escenarios a oscuras,
junta 3 reliquias en cada uno y escapa, mientras un monstruo con IA (o un segundo jugador)
lo caza. Estética Silent Hill: niebla densa, linterna y luces que fallan.

## Cómo abrirlo

Requiere **Node 18+**. Para la tabla global de puntajes también **PHP 8 + MySQL** (XAMPP sirve).

```
npm install      # solo la primera vez (instala el paquete "ws")
npm start
```

y abrir en **Google Chrome**: <http://localhost:8777>

`npm start` levanta todo: los archivos del juego, el multijugador (WebSocket) y, si encuentra
PHP (en el PATH o en `C:\xampp\php\php.exe`), el **servicio web PHP** en segundo plano (`/api/*`).
La consola muestra también la dirección en red local para jugar desde dos computadoras.

### Configurar MySQL y Facebook (una vez)

1. Copia `api/config.local.example.php` como `api/config.local.php` (no se sube al repo).
2. Pon el usuario y la contraseña de tu MySQL. La base `penumbra` y sus tablas se crean
   solas la primera vez (el esquema está en `api/sql/schema.sql` por si se quiere crear a mano).
3. Para **Facebook Login**: en <https://developers.facebook.com/apps> crea o usa tu app,
   copia el **App ID** (y de preferencia el **App Secret**) en `config.local.php`, y en
   *Inicio de sesión con Facebook → Configuración* agrega `http://localhost:8777/`.

Sin MySQL el juego funciona igual: los puntajes se guardan en este equipo (LocalStorage) y la
pantalla de puntajes avisa que está sin conexión. ¿Prefieres Apache de XAMPP en lugar de
`php -S`? Copia el proyecto a `htdocs/penumbra` y arranca con
`PHP_URL=http://localhost/penumbra/api npm start`.

## Cómo jugar

| Modo | Cómo |
|---|---|
| **Escape** | Menú → Jugar → Escape. Campaña de los **3 escenarios** en orden. En cada uno junta 3 reliquias y abre la salida. Vida, inventario y batería pasan contigo. |
| **Supervivencia** | Menú → Jugar → Supervivencia + escenario. No hay salida: las reliquias reaparecen sin fin y el monstruo acelera con cada una. Puntúan las reliquias y el tiempo. |
| **Multijugador** | Menú → Multijugador. El anfitrión elige escenario y dificultad y es el **superviviente**; quien se une con el código es el **monstruo**. Gana el superviviente si escapa; el monstruo, si le quita todas las vidas. |

Controles: **WASD** moverse · **Shift** correr · **ratón** mirar (clic para capturarlo) ·
**E** recoger / abrir (monstruo: atacar, también con clic) · **F** linterna (monstruo: rugir) ·
**1 / 2 / 3** usar batería / botiquín / agua bendita · **ESC** pausa.

### Ítems

| Ítem | Efecto |
|---|---|
| Reliquia (fragmento de llave · fusible · piedra rúnica) | Objetivo del escenario: con 3 se abre la salida. |
| Batería (1) | Recarga 60 % de la linterna. |
| Botiquín (2) | Recupera una vida. |
| Agua bendita (3) | Paraliza 5 s al monstruo si está a menos de 5 m (también al monstruo-jugador). |

### Dificultades (no dependen del tiempo)

| | Normal | Oscuro | Apagón |
|---|---|---|---|
| Vidas | 3 | 2 | 1 |
| Monstruo (ronda / persecución) | 1.25 / 1.6 m/s | 1.45 / 1.95 m/s | 1.6 / 2.25 m/s |
| Visión del monstruo | 4.5 m | 6.5 m | 8 m |
| Oído del monstruo | — | te oye correr a 6 m | correr a 9 m, caminar a 3 m |
| Linterna | se recarga apagada | gasta más, recarga lenta | gasta el doble, **no** se recarga sola |
| Niebla / ítems de ayuda | normal / todos | más densa / menos | máxima / casi ninguno |
| Puntaje | ×1 | ×1.5 | ×2.2 |

La linterna encendida ayuda a ver, pero el monstruo te detecta de más lejos.

## Rúbrica de la 3ª entrega (100 pts · 70 %)

| Requisito | Dónde está |
|---|---|
| Ejercicios de clase (30) | Los entrega cada integrante (no forman parte del repositorio). |
| Menú, configuración, puntuaciones, pausa (8) | `index.html` + `js/app.js`: `#screen-menu`, `#screen-play`, `#screen-settings`, `#screen-scores`, `#overlay-pause`, `#overlay-result`. |
| Colisiones + iluminación ambiental y focal (4) | `js/scene3d.js` (`collide`, `pushOut`, `wallBetween`, cámara por zonas). En cada escenario: `AmbientLight` + `HemisphereLight` y luces focales (velas, chimenea, fluorescentes, lámpara quirúrgica `SpotLight`, fogata, luna `DirectionalLight` con sombras, linterna `SpotLight`). |
| 2 niveles de dificultad sin usar el tiempo (10) | `js/rules.js` (`DIFFICULTY`): Normal / Oscuro / Apagón cambian vidas, velocidad, visión y oído de la IA, batería, niebla e ítems disponibles. |
| 3 escenarios totalmente distintos (10) | Mansión Ravenwood (`js/scene3d.js`, interior victoriano), Hospital San Judas (`js/levels/hospital.js`, hospital abandonado), Bosque de Ceniza (`js/levels/forest.js`, exterior nocturno con árboles `InstancedMesh`). Cada uno en su propia `THREE.Scene`, con texturas, niebla, luces, sonido y partículas propias. |
| 2 modos de juego distintos (10) | Escape (campaña) y Supervivencia (reliquias infinitas), además del Multijugador versus. |
| Servicio web + red social (4) | Servicio **PHP** en `api/` (`auth.php`, `scores.php`, `public.php`) con **MySQL** (`api/sql/schema.sql`), consumido con `fetch` desde `js/api.js`. El servidor **recalcula** los puntos (`api/lib/rules.php`). **Facebook Login** con el SDK de JS y el token verificado en PHP contra la Graph API. Compartir el resultado en Facebook y X. Almacenamiento local: `localStorage` (configuración, sesión, puntajes sin conexión). |
| Sonido y música + 3 ítems (10) | `js/audio.js`: música de fondo distinta por escenario (drone + melodía generativa con eco), latido y cuerdas de tensión según la distancia al monstruo, pasos según el suelo, efectos de ítems, golpes, cerraduras, victoria y derrota. Ítems: batería, botiquín, agua bendita (+ reliquias). |
| Multijugador en tiempo real (10) | `server.js` + `js/net.js`: posiciones a 15 Hz con interpolación y eventos de partida (recoger, vida, golpe, agua bendita, fin) sincronizados. |
| *(Opcional)* Partículas + IA (4) | Partículas: polvo, chispas de un fluorescente roto, ceniza y brasas, destello del agua bendita. IA: el monstruo ronda, te **ve** (distancia + línea de visión sin muros, más lejos si llevas la linterna), te **oye** según la dificultad, te persigue, ataca y busca donde te vio por última vez. |

## Pruebas

```
npm test
```

46 pruebas con `node --test`: reglas y puntaje (`test/rules.test.js`), servicio web PHP de punta a
punta con una base SQLite temporal, incluida la igualdad de la fórmula de puntaje JS = PHP
(`test/api.test.js`, se omite si no hay PHP), y multijugador (`test/multiplayer.test.js`).

Para probar el servicio contra un MySQL real (crea y borra una base desechable `penumbra_test_*`):

```
TEST_DB_DRIVER=mysql DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASS=tu_contraseña npm test
```

## Estructura

```
server.js                servidor Node: estáticos + salas WebSocket + proxy /api → PHP
index.html · css/styles.css
js/app.js                pantallas, partida, resultado, puntajes, sesión, compartir
js/rules.js              dificultades, ítems, modos, escenarios y puntaje (lógica pura)
js/scene3d.js            motor: niveles, Mansión, partida, IA, cámara, colisiones, red
js/levels/hospital.js    escenario 2
js/levels/forest.js      escenario 3
js/characters.js         superviviente GLTF animado + monstruo procedural
js/audio.js              música y efectos (Web Audio API)
js/net.js                cliente WebSocket
js/api.js                cliente del servicio web (fetch) + Facebook SDK + LocalStorage
js/settings.js           configuración persistente (LocalStorage)
js/lib/                  Three.js r160 y addons oficiales (vendorizados, offline)
api/auth.php             inicio de sesión (Facebook / invitado), sesión por token
api/scores.php           guardar y listar puntajes
api/public.php           estado del servicio y App ID de Facebook
api/lib/                 configuración, PDO/MySQL, fórmula de puntaje
api/sql/schema.sql       esquema MySQL (usuarios, sesiones, puntajes)
api/config.local.example.php   plantilla de credenciales
assets/models/           modelos GLB, OBJ/MTL y Collada
test/                    pruebas automáticas
```

## Créditos de modelos

- **Superviviente:** *KayKit — Adventurers Character Pack 1.0* de Kay Lousberg
  (<https://kaylousberg.com>), licencia CC0.
- **Monstruo:** figura tipo Slenderman modelada por el equipo con primitivas de Three.js
  y animada por código (`js/characters.js`).
- **Lámpara de bola:** modelo OBJ + MTL de Avonni Lighting (<http://www.avonni.com>).
- **Utilería del estudio:** álbum *Scrapbook*, *Doom Book* y libro rojo de *Resident Evil:
  Deadly Silence* (DS, Capcom) y racimo de plátanos de *Let's Go Island: Lost on the Island of
  Tropics* (Arcade, Sega).
- **Araña:** de *Seaman* (Dreamcast, Sega/Vivarium), Collada con esqueleto animada por código.
- Los modelos de juegos comerciales se obtuvieron de The Models Resource y se usan solo con
  fines académicos; sus derechos pertenecen a sus respectivas compañías.
- Hospital, bosque, ítems y el resto de la utilería: figuras básicas de Three.js con texturas
  procedurales hechas por el equipo.
