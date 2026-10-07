# SPEC 01 — Cuatro fantasmas con comportamientos del original

> **Status:** Implemented
> **Depends on:** —
> **Date:** 2026-10-07
> **Objective:** Juego con 4 fantasmas donde cada uno aplica su estrategia original de Pac-Man y el rojo persigue agresivamente a Pac-Man.

## Scope

**In:**

- 4 entradas en `GHOST_STARTS` (`src/js/maze.js`) con `kind: 'blinky' | 'pinky' | 'inky' | 'clyde'` y sus posiciones: Blinky fuera de la pen en `(13,11)`; Pinky `(13,14)`, Inky `(11,14)` y Clyde `(16,14)` dentro.
- 4 comportamientos en `decideGhost` (`src/js/game.js`), con elección por distancia Manhattan sin invertir dirección (salvo callejón sin salida).
- Liberación escalonada por frames: Blinky activo ya, Pinky a los 90 frames, Inky a 180, Clyde a 270 (1.5 s de diferencia a 60 fps). Esperando en la pen no se mueven.
- Al salir de la pen, ruta con sesgo a la puerta `(13,12)` hasta salir del rectángulo de la pen.
- Color por `kind` en `src/js/render.js` (rojo, rosa, cian, naranja — colores originales).
- Reinicio de los temporizadores de liberación al perder una vida.

**Out of scope (para specs futuros):**

- Power pellet y estado asustado/comestible.
- Fases globales scatter/chase (ida a esquinas por temporizador).
- Cruise Elroy (aceleración del rojo con pocos dots).
- Cambios de velocidad por nivel, túnel más lento para fantasmas, nuevas pantallas.

## Data model

```js
// maze.js
const GHOST_STARTS = [
  { x: 13, y: 11, kind: "blinky" }, // fuera de la pen, sobre la puerta
  { x: 13, y: 14, kind: "pinky" }, // pen
  { x: 11, y: 14, kind: "inky" }, // pen
  { x: 16, y: 14, kind: "clyde" }, // pen
];

// game.js — game.frame cuenta frames jugados; cada fantasma:
ghost = { x, y, dir, speed, kind, releaseFrame };
// game.frame < releaseFrame → fantasma esperando, no se mueve.
```

```js
// render.js — color por kind, no por índice
const GHOST_COLOR_BY_KIND = {
  blinky: "#ff0000",
  pinky: "#ffb8ff",
  inky: "#00ffff",
  clyde: "#ffb852",
};
```

Convenciones: pen = filas 13-15, columnas 11-16; puerta en fila 12, columnas 13-14. `MAZE` sigue sin mutarse.

## Implementation plan

1. `maze.js`: 4 entradas en `GHOST_STARTS` con sus `kind`. `game.js`: renombrar la rama `'hunter'` de `decideGhost` a `'blinky'`. Prueba: 4 fantasmas en pantalla, el rojo persigue, los otros tres se mueven al azar.
2. `render.js`: sustituir `GHOST_COLORS` por `GHOST_COLOR_BY_KIND`. Prueba: rojo, rosa, cian y naranja en el orden de `GHOST_STARTS`.
3. `game.js`: añadir `game.frame` (incremento en `update`) y `releaseFrame` por fantasma; `moveGhost` retorna si aún no ha sido liberado. Prueba: los 3 de la pen quedan quietos y salen escalonados.
4. `game.js`: `resetPositions` recalcula `releaseFrame` desde el frame actual (+0/+90/+180/+270). Prueba: al chocar, los 3 vuelven a esperar y re-salen escalonados.
5. `game.js`: dentro del rectángulo de la pen, `decideGhost` elige la dirección que reduce la distancia a `(13,12)`. Prueba: cada fantasma liberado sale de la pen en pocos frames.
6. `game.js`: comportamiento Pinky — target = Pacman + 4 celdas en su `dir` (recortado al laberinto). Prueba: Pinky embosca por donde irá Pacman.
7. `game.js`: comportamiento Inky — `punto = Pacman + 2·dir`, `target = 2·punto − Blinky` (Blinky localizado por `kind`). Prueba: Inky ataca por un flanco distinto a Pinky.
8. `game.js`: comportamiento Clyde — distancia Manhattan a Pacman > 8 → persigue; ≤ 8 → target esquina `(1,29)`. Prueba: Clyde se aleja cuando se acerca demasiado.

## Acceptance criteria

- [ ] `src/index.html` carga sin errores en consola.
- [ ] Hay 4 fantasmas con colores rojo, rosa, cian y naranja.
- [ ] El rojo se mueve desde el primer frame; los otros tres esperan en la pen y salen con ~90 frames de diferencia entre ellos.
- [ ] En cada intersección el rojo elige siempre la dirección que más reduce la distancia a Pac-Man.
- [ ] Pinky se dirige a 4 celdas por delante de Pacman en su dirección.
- [ ] Inky calcula su target con la fórmula `2·punto − Blinky` (su destino cambia según la posición de Blinky).
- [ ] Clyde persigue a más de 8 celdas de Pacman y se retira a `(1,29)` a 8 o menos.
- [ ] Ningún fantasma invierte su dirección salvo en callejón sin salida.
- [ ] Al perder una vida, los 4 vuelven a su posición de inicio y los temporizadores de liberación se reinician.
- [ ] Comer dots, ganar y perder siguen funcionando igual que antes.

## Decisions

- **Sí:** `kind` con nombres `blinky|pinky|inky|clyde`. **No:** mantener `hunter|random` — dos categorías no alcanzan para 4 estrategias.
- **Sí:** liberación contada en frames (90 ≈ 1.5 s a 60 fps). **No:** `performance.now()` — el juego no usa reloj y todas las velocidades ya son por frame.
- **Sí:** color indexado por `kind`. **No:** color por índice del array — se rompe si cambia el orden de `GHOST_STARTS`.
- **Sí:** fórmula original de Inky. **No:** versión simplificada "2 celdas delante" — casi el mismo código y pierde la personalidad.
- **Sí:** salida de pen dirigida a la puerta. **No:** dejarlo al azar — tarda demasiado y no es fiel al original.
- **No:** fases scatter/chase, Cruise Elroy y power pellet en este spec. Motivo: avance incremental acordado ("poco a poco").

## Risks

| Riesgo                                                                        | Mitigación                                                                        |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `requestAnimationFrame` no corre a 60 fps exactos → los 1.5 s son aproximados | Aceptado; el escalonado se percibe igual. Si importa, pasar a reloj en otro spec. |
| Inky depende de Blinky                                                        | Localizarlo por `kind === 'blinky'`; si no existe, cae al target de Blinky.       |
| Fantasma liberado atascado en la pen                                          | El sesgo a la puerta (paso 5) se aplica hasta salir del rectángulo de la pen.     |

## What is **not** in this spec

- Power pellet / fantasmas asustados (otro spec).
- Fases scatter/chase globales (otro spec).
- Cruise Elroy (otro spec).
