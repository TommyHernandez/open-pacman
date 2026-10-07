// game.js
// Estado y reglas. Depende de globals de maze.js: MAZE, TUNNEL_ROW,
// PACMAN_START, GHOST_STARTS.

const DIRS = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};
const OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' };

const PACMAN_SPEED = 0.125; // 1/8 celda/frame -> alinea cada 8 frames
const GHOST_SPEED = 0.1;    // 1/10 celda/frame
const RELEASE_INTERVAL = 90; // frames entre liberaciones (1.5 s a 60 fps)

// Turno de salida de cada fantasma (0 = activo desde el primer frame).
// Se define por kind, no por posicion en el array: el orden de GHOST_STARTS
// puede cambiar sin romper el escalonado.
const RELEASE_TURN_BY_KIND = {
  blinky: 0,
  pinky: 1,
  inky: 2,
  clyde: 3,
};

// Pen: interior de filas 13-15 y columnas 11-16; la puerta esta en la
// celda (13,12), fila de arriba. Mismo rectangulo que describe el spec.
const PEN_RECT = { top: 13, bottom: 15, left: 11, right: 16 };
const PEN_DOOR = { x: 13, y: 12 };

function isInsidePen( actor ) {
  return (
    actor.y >= PEN_RECT.top && actor.y <= PEN_RECT.bottom &&
    actor.x >= PEN_RECT.left && actor.x <= PEN_RECT.right
  );
}

// Recorta un punto a los limites del laberinto (para targets que se salen).
function clampToGrid( grid, x, y ) {
  return {
    x: Math.min( Math.max( x, 0 ), grid[ 0 ].length - 1 ),
    y: Math.min( Math.max( y, 0 ), grid.length - 1 ),
  };
}

// Crea una partida nueva. Copia MAZE (pristino) a game.grid para poder comer
// dots sin destruir el original, y reiniciar.
function createGame() {
  const grid = MAZE.map( ( row ) => row.slice() );
  // La celda de inicio de Pacman arranca sin dot.
  grid[ PACMAN_START.y ][ PACMAN_START.x ] = 0;

  let dots = 0;
  for ( const row of grid ) for ( const v of row ) if ( v === 2 ) dots++;

  return {
    state: 'start',
    frame: 0,
    score: 0,
    lives: 3,
    dotsRemaining: dots,
    grid,
    pacman: {
      x: PACMAN_START.x,
      y: PACMAN_START.y,
      dir: 'left',
      nextDir: null,
      speed: PACMAN_SPEED,
    },
    ghosts: GHOST_STARTS.map( ( ghostStart ) => ( {
      x: ghostStart.x,
      y: ghostStart.y,
      dir: 'up',
      speed: GHOST_SPEED,
      kind: ghostStart.kind,
      releaseFrame: RELEASE_TURN_BY_KIND[ ghostStart.kind ] * RELEASE_INTERVAL,
    } ) ),
  };
}

function aligned( v ) {
  return Math.abs( v - Math.round( v ) ) < 1e-3;
}

// Una celda es muro para el actor dado?
//   pacman: bloqueado por pared (1) y puerta (3)
//   ghost:  bloqueado solo por pared (1)
function isWall( grid, x, y, actor ) {
  if ( y < 0 || y >= grid.length ) return true;
  if ( x < 0 || x >= grid[ 0 ].length ) return true;
  const v = grid[ y ][ x ];
  if ( v === 1 ) return true;
  if ( v === 3 && actor === 'pacman' ) return true;
  return false;
}

// Puede el actor avanzar desde (x,y) en la direccion dir?
function canMove( grid, x, y, dir, actor ) {
  const d = DIRS[ dir ];
  if ( !d ) return false;
  const tx = x + d.x;
  const ty = y + d.y;
  // Tunel: salir por un borde en la fila del tunel siempre es valido.
  if ( ty === TUNNEL_ROW && ( tx < 0 || tx >= grid[ 0 ].length ) ) return true;
  return !isWall( grid, tx, ty, actor );
}

function wrapTunnel( a, width ) {
  if ( Math.round( a.y ) === TUNNEL_ROW ) {
    if ( a.x < 0 ) a.x += width;
    else if ( a.x >= width ) a.x -= width;
  }
}

function movePacman( game ) {
  const p = game.pacman;
  const grid = game.grid;
  const width = grid[ 0 ].length;

  if ( aligned( p.x ) && aligned( p.y ) ) {
    p.x = Math.round( p.x );
    p.y = Math.round( p.y );

    // Aplicar giro pendiente si es posible.
    if ( p.nextDir && canMove( grid, p.x, p.y, p.nextDir, 'pacman' ) ) {
      p.dir = p.nextDir;
      p.nextDir = null;
    }
    // Comer dot.
    if ( grid[ p.y ][ p.x ] === 2 ) {
      grid[ p.y ][ p.x ] = 0;
      game.score += 10;
      game.dotsRemaining--;
    }
    // Si no puede seguir, se detiene en la celda.
    if ( !canMove( grid, p.x, p.y, p.dir, 'pacman' ) ) return;
  }

  const d = DIRS[ p.dir ];
  p.x += d.x * p.speed;
  p.y += d.y * p.speed;
  wrapTunnel( p, width );
}

// Elige la direccion que mas reduce la distancia Manhattan hasta (targetX, targetY).
// Se usa para perseguir (target = Pacman) y para las variantes de los demas fantasmas.
function closestDirTo( ghost, choices, targetX, targetY ) {
  let bestDir = choices[ 0 ];
  let bestDistance = Infinity;
  for ( const dir of choices ) {
    const step = DIRS[ dir ];
    const nextX = ghost.x + step.x;
    const nextY = ghost.y + step.y;
    const distance = Math.abs( nextX - targetX ) + Math.abs( nextY - targetY );
    if ( distance < bestDistance ) {
      bestDistance = distance;
      bestDir = dir;
    }
  }
  return bestDir;
}

function decideGhost( game, ghost ) {
  const grid = game.grid;
  const pacman = game.pacman;

  const options = Object.keys( DIRS ).filter(
    ( dir ) => dir !== OPPOSITE[ ghost.dir ] && canMove( grid, ghost.x, ghost.y, dir, 'ghost' )
  );
  // Sin salida (callejon): permitir el giro de 180.
  const choices = options.length ? options : [ OPPOSITE[ ghost.dir ] ];

  // Dentro de la pen solo importa salir: camino directo a la puerta (13,12).
  if ( isInsidePen( ghost ) ) {
    ghost.dir = closestDirTo( ghost, choices, PEN_DOOR.x, PEN_DOOR.y );
    return;
  }

  switch ( ghost.kind ) {
    case 'blinky': {
      // Persigue agresivamente: va directo a la celda de Pacman.
      const pacmanCellX = Math.round( pacman.x );
      const pacmanCellY = Math.round( pacman.y );
      ghost.dir = closestDirTo( ghost, choices, pacmanCellX, pacmanCellY );
      break;
    }
    case 'pinky': {
      // Embosca: apunta 4 celdas por delante de Pacman en su direccion.
      const aheadStep = DIRS[ pacman.dir ];
      const ambushCell = clampToGrid(
        grid,
        Math.round( pacman.x ) + aheadStep.x * 4,
        Math.round( pacman.y ) + aheadStep.y * 4
      );
      ghost.dir = closestDirTo( ghost, choices, ambushCell.x, ambushCell.y );
      break;
    }
    case 'inky': {
      // Formula original: punto 2 celdas delante de Pacman, y el vector
      // desde Blinky hasta ese punto, duplicado. target = 2·punto − Blinky.
      const blinky = game.ghosts.find( ( other ) => other.kind === 'blinky' );
      if ( !blinky ) {
        // Sin Blinky no hay vector: cae al target de Blinky (el de Pacman).
        ghost.dir = closestDirTo(
          ghost, choices, Math.round( pacman.x ), Math.round( pacman.y )
        );
        break;
      }
      const aheadStep = DIRS[ pacman.dir ];
      const aheadCellX = Math.round( pacman.x ) + aheadStep.x * 2;
      const aheadCellY = Math.round( pacman.y ) + aheadStep.y * 2;
      ghost.dir = closestDirTo(
        ghost,
        choices,
        2 * aheadCellX - Math.round( blinky.x ),
        2 * aheadCellY - Math.round( blinky.y )
      );
      break;
    }
    default:
      ghost.dir = choices[ Math.floor( Math.random() * choices.length ) ];
  }
}

function moveGhost( game, ghost ) {
  // Fantasma esperando su turno de liberacion: no se mueve.
  if ( game.frame < ghost.releaseFrame ) return;

  const grid = game.grid;
  const width = grid[ 0 ].length;

  if ( aligned( ghost.x ) && aligned( ghost.y ) ) {
    ghost.x = Math.round( ghost.x );
    ghost.y = Math.round( ghost.y );
    decideGhost( game, ghost );
    if ( !canMove( grid, ghost.x, ghost.y, ghost.dir, 'ghost' ) ) return;
  }

  const step = DIRS[ ghost.dir ];
  ghost.x += step.x * ghost.speed;
  ghost.y += step.y * ghost.speed;
  wrapTunnel( ghost, width );
}

function resetPositions( game ) {
  const p = game.pacman;
  p.x = PACMAN_START.x;
  p.y = PACMAN_START.y;
  p.dir = 'left';
  p.nextDir = null;
  game.ghosts.forEach( ( ghost, i ) => {
    const ghostStart = GHOST_STARTS[ i ];
    ghost.x = ghostStart.x;
    ghost.y = ghostStart.y;
    ghost.dir = 'up';
    // Tras perder una vida vuelve a salir escalonado: el turno se cuenta
    // desde el frame actual, no desde cero.
    ghost.releaseFrame =
      game.frame + RELEASE_TURN_BY_KIND[ ghost.kind ] * RELEASE_INTERVAL;
  } );
}

function collides( a, b ) {
  return Math.abs( a.x - b.x ) < 0.5 && Math.abs( a.y - b.y ) < 0.5;
}

function update( game ) {
  game.frame++;
  movePacman( game );
  game.ghosts.forEach( ( ghost ) => moveGhost( game, ghost ) );

  for ( const ghost of game.ghosts ) {
    if ( collides( game.pacman, ghost ) ) {
      game.lives--;
      if ( game.lives <= 0 ) {
        game.state = 'lost';
        return;
      }
      resetPositions( game );
      break;
    }
  }

  if ( game.dotsRemaining <= 0 ) game.state = 'won';
}

window.createGame = createGame;
window.update = update;
window.DIRS = DIRS;
