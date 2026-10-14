# PENUMBRA — Escape Room de Terror

Proyecto de la UA **Gráficas Computacionales en Web** · Grupo 051 · Ago–Dic 2026

Escape room de puzzles con terror. Un jugador busca la salida resolviendo acertijos
mientras un monstruo con IA lo persigue. En multijugador uno controla al superviviente
y otro al monstruo.

> **Equipo:** el plan de lo que falta para el 2º avance está en [TAREAS-2DO-AVANCE.md](TAREAS-2DO-AVANCE.md).

## Cómo abrirlo (2º avance)

Desde el 2º avance el juego trae su propio servidor en **Node.js** (sirve los archivos
y además mueve el multijugador por WebSocket). Requiere Node 18 o superior.

```
npm install      # solo la primera vez (instala el paquete "ws")
npm start
```

y abrir en **Google Chrome**: <http://localhost:8777>

La consola del servidor también muestra la dirección en **red local**
(p. ej. `http://192.168.1.50:8777`): así se juega desde dos computadoras en la misma red.
Para probar en una sola computadora basta con abrir **dos pestañas o ventanas**.

> Ya no sirve `python -m http.server`: sin `npm start` no hay multijugador.

## Cómo jugar

| Modo | Cómo |
|---|---|
| Un jugador | Menú → **Jugar**. Eres el superviviente; el monstruo lo controla la computadora (ronda por toda la mansión y te persigue si te ve). |
| Multijugador | Menú → **Multijugador**. Uno pulsa **Crear sala** (será el **superviviente**) y le pasa el código de 4 letras al otro, que lo escribe en **Unirse** (será el **monstruo**). Al juntarse, los dos entran a la partida. |

Controles: **WASD** moverse · **Shift** correr · **ratón** mirar (clic en la escena para
capturarlo) · **F** linterna (superviviente) / rugido (monstruo) · **ESC** pausa.

## Rúbrica del 2º avance (100 pts · 15 %)

| Requisito | Dónde está |
|---|---|
| 4 ejercicios realizados en clase (30) | Los entrega cada integrante (no forman parte de este repositorio). |
| **Funcionamiento de modo multijugador** (50) | `server.js` (salas por código, máx. 2 jugadores, reenvío de estado) + `js/net.js` (cliente WebSocket). Cada jugador ve al otro moverse y animarse en tiempo real (15 actualizaciones/s con interpolación); los eventos de linterna y rugido también se sincronizan; avisos al entrar o salir el rival y ping en el HUD. |
| **Modelos con texturas y animaciones cargados con WebGL** (20) | `js/characters.js`: modelos **GLTF/GLB** cargados con `GLTFLoader` y animados con `AnimationMixer` (idle / caminar / correr con transiciones suaves, velocidad de animación ajustada a la de movimiento). **Superviviente** = `Rogue_Hooded.glb`, personaje low-poly de KayKit con su textura (se le ocultan las armas y lleva una linterna en la mano). **Monstruo** = figura alta y delgada tipo Slenderman, toda negra, modelada por nosotros con primitivas de Three.js (cilindros, cajas y esferas) organizadas en una jerarquía de pivotes (cadera/rodilla, hombro/codo) y animada por código: la caminata/carrera usa senos sincronizados con la velocidad y, quieto, respira y ladea la cabeza. El escenario conserva sus texturas y animaciones (fuego, péndulo, candelabros, foco que falla, polvo). |

Extras que adelantan la entrega final: **colisiones** con paredes y mobiliario, entre
los dos personajes, y de la cámara contra los muros. Linterna como **luz focal** con
batería. **IA** básica del monstruo en modo un jugador.

## Qué incluía el 1er avance

Interfaz (la rúbrica del 1er avance no pedía 3D todavía):

| Pantalla | Archivo / sección |
|---|---|
| Menú principal | `#screen-menu` |
| Multijugador (crear / unirse por código) | `#screen-multiplayer` |
| Puntajes (tabla + login social maqueta) | `#screen-scores` |
| Configuración (volumen, música, dificultad, calidad, sensibilidad) | `#screen-settings` |
| Menú de pausa (ESC dentro del juego) | `#overlay-pause` |
| Pantalla de juego con HUD (objetivo, inventario, linterna, retícula) | `#screen-game` |

- **Estilos:** `css/styles.css` — paleta de terror, niebla, grano de película, parpadeo.
- **Imágenes:** `assets/scene-mansion.svg` (escena de fondo) + iconos SVG del inventario.
- **Audio:** `js/audio.js` — ambiente y efectos generados con Web Audio API (sin archivos).
  Se reemplazará por música/efectos reales más adelante.
- **Almacenamiento local:** `js/settings.js` — la configuración se guarda en `localStorage`
  (adelanta el requisito de LocalStorage de la UA).
- **Escenario 3D (WebGL / Three.js):** `js/scene3d.js` — la Mansión Ravenwood (estudio →
  pasillo → gran salón con comedor, piano, armaduras, escalera y ventanales) construida **solo con figuras básicas** (cajas, cilindros, planos, esferas,
  conos, toros) y texturas procedurales dibujadas en `<canvas>`. Iluminación ambiental +
  focal (chimenea, lámpara, velas) + luz de luna. En el 1er avance era solo una vista
  cinemática; desde el 2º avance se juega en tercera persona.
  Three.js va incluido en `js/lib/` (funciona sin internet).

## Estructura

```
server.js                servidor Node: archivos estáticos + salas multijugador (WebSocket)
package.json             dependencia "ws" y script npm start
index.html
css/styles.css
js/app.js                navegación entre pantallas, pausa, flujo de salas
js/net.js                cliente WebSocket (crear / unirse / estado / eventos)
js/scene3d.js            escenario 3D, control en 3ª persona, colisiones, red
js/characters.js         carga de modelos GLTF, texturas y animaciones
js/audio.js              audio procedural (Web Audio API)
js/settings.js           configuración persistente (localStorage)
js/lib/three.module.min.js         Three.js r160 (vendorizado, offline)
js/lib/addons/loaders/GLTFLoader.js   addon oficial de Three.js r160
js/lib/addons/utils/*.js              BufferGeometryUtils y SkeletonUtils (r160)
assets/models/Rogue_Hooded.glb  superviviente (KayKit Adventurers, Kay Lousberg, CC0)
assets/scene-mansion.svg
```

## Pendiente para los siguientes avances

- 3ª entrega: colisiones, 2 niveles de dificultad, 3 escenarios, 2 modos de juego,
  3+ ítems, servicio web + BD (MySQL/SQL Server), login social real, sonido final,
  multijugador en tiempo real, (opcional) partículas + IA.

## Créditos de modelos

- **Superviviente:** *KayKit — Adventurers Character Pack 1.0* de Kay Lousberg
  (<https://kaylousberg.com>), licencia CC0.
- **Monstruo:** figura tipo Slenderman modelada por el equipo con primitivas de Three.js
  y animada por código (`js/characters.js`).
