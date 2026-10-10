# Plan para entregar el 2º avance

Nos quedan **2 días**. El juego ya cumple los dos requisitos técnicos de la rúbrica
(multijugador y modelos animados con textura). Lo que falta es **asegurar la demo**
y que **cada quien tenga sus 4 ejercicios de clase**. No metan funciones nuevas grandes
ahora: cada cambio a última hora es un riesgo para la presentación.

## Qué pide la rúbrica (100 pts · 15 % de la calificación)

| Requisito | Pts | Estado |
|---|---|---|
| 4 ejercicios realizados en clase | 30 | **Pendiente: lo trae cada integrante** |
| Funcionamiento de modo multijugador (sin lógica de ganar/perder) | 50 | Hecho |
| Todos los modelos con texturas y animaciones cargados con WebGL | 20 | Hecho |

> La lista de chequeo tiene **matrícula y nombre por alumno**: los 30 pts de ejercicios
> son individuales. Si a alguien le faltan, pierde hasta 30 pts aunque el juego esté perfecto.

---

## Paso 0 · Todos, HOY (30 min)

1. Instalar **Node.js 18 o superior** (<https://nodejs.org>, versión LTS) y **Git**.
2. Aceptar la invitación al repositorio en GitHub (les llega por correo).
3. Clonar y correr:
   ```
   git clone https://github.com/DKL95/penumbra.git
   cd penumbra
   npm install
   npm start
   ```
4. Abrir **Google Chrome** en <http://localhost:8777> y probar:
   - **Jugar** → moverse con WASD, Shift para correr, clic en la escena y mover el ratón, F linterna, ESC pausa.
   - **Multijugador** → abrir dos pestañas: en una **Crear sala**, en la otra escribir el código y **Unirse**.
5. Avisar en el grupo: "me corre ✅" o el error exacto que les salió (captura de la consola del navegador con F12).

Si Windows pregunta por el **Firewall** al hacer `npm start`, marcar **Redes privadas** y **Permitir**.
Sin eso no se pueden conectar otras computadoras.

---

## Reparto por rol (los roles de la FE)

### Programador integrador de modelos 3D, colisiones y servicios de comunicación
Es quien debe saber explicar `server.js`, `js/net.js` y `js/characters.js`.

**Día 1**
- [ ] Probar el multijugador **entre dos computadoras** en la misma red Wi‑Fi:
      una corre `npm start` y la otra abre la dirección "Red local" que imprime la consola
      (p. ej. `http://192.168.1.50:8777`). Anotar cualquier falla.
- [ ] Probar también con el **hotspot de un celular** (por si la red de la escuela bloquea conexiones entre equipos).
      Si la red de la escuela no deja, el plan B es la demo en **una sola computadora con dos ventanas de Chrome lado a lado**.
- [ ] Leer y entender el flujo: crear sala → código de 4 letras → unirse → el servidor reenvía `state`
      (posición, rotación, velocidad) 15 veces por segundo → el otro cliente interpola.

**Día 2**
- [ ] Ensayar la explicación (2 min) de cómo se cargan los modelos: `GLTFLoader` → `AnimationMixer` →
      clips idle / walk / run con `crossFade`, y por qué el monstruo usa una textura generada en canvas.
- [ ] Tener sus 4 ejercicios de clase listos y a la mano (carpeta o enlace).

### Programador de lógica e interacciones
Es quien debe saber explicar el control del jugador y la pausa (`js/scene3d.js`, sección
"PARTIDA", y `js/app.js`).

**Día 1**
- [ ] Jugar 10 minutos en cada modo buscando errores: atravesar muebles, quedarse atorado,
      la pausa no responde, el ratón no se suelta, el HUD muestra datos equivocados.
      Anotar **cómo reproducir** cada error y subirlo como *Issue* en GitHub.
- [ ] Probar el ciclo completo varias veces: Menú → Multijugador → jugar → ESC → Salir al menú → volver a crear sala.

**Día 2**
- [ ] Ensayar la explicación (2 min): movimiento relativo a la cámara, colisiones círculo‑contra‑caja,
      IA del monstruo en modo un jugador (ronda entre puntos y se acerca si te ve cerca).
- [ ] Tener sus 4 ejercicios de clase listos.

### Desarrollador de shaders, ambientación y diseñador de interfaz
Es quien debe saber explicar la escena, las luces y el HUD (`js/scene3d.js` parte de
construcción, `css/styles.css`, `js/audio.js`).

**Día 1**
- [ ] Revisar el juego en **Configuración → Calidad gráfica Baja / Media / Alta** en una laptop
      sin tarjeta de video dedicada (la compu donde se va a presentar). Si va lento, dejar "Baja" para la demo.
- [ ] Sacar **capturas de pantalla** buenas (las dos vistas del multijugador, los dos personajes de cerca)
      por si el profe pide evidencias o algo falla el día de la entrega.

**Día 2**
- [ ] Ensayar la explicación (2 min): iluminación ambiental + focal (linterna, chimenea, lámpara, velas),
      texturas procedurales en canvas, niebla, sonido generado con Web Audio.
- [ ] Tener sus 4 ejercicios de clase listos.

---

## Día 2 · Todos juntos: ensayo de la demo (1 hora)

Guion sugerido (≈ 6 min):

1. **Arranque** — `npm start` y abrir Chrome. Mostrar el menú (pantallas del 1er avance).
2. **Modelos** (requisito de 20 pts) — "Jugar": mostrar al superviviente caminando y corriendo
   (cambian las animaciones), y al monstruo acercándose. Mencionar texturas y animaciones.
3. **Multijugador** (requisito de 50 pts) — dos computadoras (o dos ventanas):
   crear sala, unirse con el código, mover a los dos personajes, que se vea en ambas pantallas.
   Pulsar F con el monstruo: al superviviente le sale "Algo ruge muy cerca…".
   Cerrar una ventana: a la otra le llega "abandonó la partida".
4. **Preguntas** — cada quien contesta lo de su rol.

Checklist del día de la entrega:
- [ ] Laptop cargada y con el proyecto **ya clonado y con `npm install` hecho** (no depender del internet de la escuela).
- [ ] Chrome actualizado.
- [ ] Probar `npm start` antes de que nos toque.
- [ ] Cada integrante con sus 4 ejercicios de clase.
- [ ] Confirmar con el profe **cómo se entrega** (enlace al repo, ZIP, plataforma) y subirlo a tiempo.

---

## Reglas para no romper nada

- Trabajen en una **rama** (`git checkout -b arreglo-x`) y abran un *Pull Request*; no suban directo a `main`.
- Antes de subir cualquier cambio: `npm start`, probar un jugador y multijugador. Si algo deja de funcionar, no se sube.
- El **último día no se agregan funciones**, solo arreglos pequeños.
- Si algo truena, avisen en el grupo con captura de la consola (F12 → Console).

## Lo que viene después (3ª entrega, 70 %)

No es para estos dos días, pero para que lo tengan en el radar:
2 niveles de dificultad (que no sean por tiempo), 3 escenarios totalmente distintos,
2 modos de juego, 3+ ítems, **servicio web en PHP / Java / .NET con MySQL o SQL Server**
(el servidor de Node del multijugador no cuenta como ese servicio), login con Facebook / Twitter /
Instagram, música y efectos finales, partículas e IA del monstruo.
