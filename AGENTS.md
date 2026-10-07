# AGENTS.md

Pac-Man clone in vanilla JS/HTML/CSS. There is **no** `package.json`, build step, bundler,
test runner, linter, formatter config, or CI. Don't add tooling unless asked.

## Running / verifying

- Open `src/index.html` directly in a browser — `file://` works, all asset paths are relative.
  This is the only verification step in this repo; there is nothing to run or automate.
- Debugging means adding temporary `console.log` or using devtools breakpoints; the entrypoint
  is the `loop()` call at the bottom of `src/js/main.js`.

## Architecture: globals, not modules

Scripts are classic `<script>` tags (no `type="module"`, no imports) and **load order in
`src/index.html` is the dependency graph**: `maze.js` -> `game.js` -> `render.js` -> `main.js`.

Each file ends by publishing what later files need onto `window`:

| File | Publishes |
| --- | --- |
| `src/js/maze.js` | `MAZE`, `TUNNEL_ROW`, `PACMAN_START`, `GHOST_STARTS` |
| `src/js/game.js` | `createGame`, `update`, `DIRS` |
| `src/js/render.js` | `draw` |

Gotchas that are easy to miss:

- `render.js` reads `DIRS` from `game.js` and `game.grid` from the game state. New files must be
  added as `<script>` tags in dependency order and expose their cross-file API via `window`.
- `MAZE` is pristine and **must never be mutated**. `createGame()` deep-copies it into
  `game.grid`, which is what dots-eaten writes into and what `render.js` draws. Mutating `MAZE`
  silently breaks restart.
- Actor-dependent collision: `isWall()` blocks Pac-Man on `1` (wall) *and* `3` (pen door), but
  ghosts only on `1` — so ghosts leave the pen on their own (`src/js/game.js:56`). There is no
  power-pellet / frightened state; `decideGhost` only branches on `g.kind` (`hunter` | `random`).
- Horizontal wrap happens **only** on `TUNNEL_ROW` (14), via `canMove`/`wrapTunnel`. Out-of-bounds
  is a wall everywhere else.
- Actor positions are fractional cell coordinates. Cell-snapping logic only runs when
  `aligned()` is true (`< 1e-3` from an integer); speeds are per-frame fractions
  (`PACMAN_SPEED = 1/8` cell, `GHOST_SPEED = 1/10`). Changing speed is fine, but don't assume
  positions are always integers when touching movement or collision code.

## Maze invariants (`src/js/maze.js`)

The maze is authored as 31 strings of exactly 28 chars, then parsed to numbers. If you edit it,
preserve all three (currently verified true, nothing enforces them at runtime):

- 31 rows x 28 cols; `x in [0,27]`, `y in [0,30]`, origin top-left; indexed as `MAZE[y][x]`.
- Vertical symmetry about the axis between columns 13 and 14.
- Canvas size stays `28 * TILE x 31 * TILE` = `560x620` with `TILE = 20`
  (`src/index.html`, `src/css/style.css`, `src/js/render.js`).

Char legend: `#` wall=1, `.` dot=2, `-` pen door=3, space=0 (walkable empty).

## Conventions

- **Formatting is deliberately non-default**: spaces inside parens and brackets —
  `MAZE.map( ( row ) => row.slice() )`, `for ( const v of row )`, `[ 'left', 'right' ]`.
  2-space indent, single quotes, semicolons, arrow callbacks. Match it; do not run a reformatter.
- **Spanish** for code comments, HUD/overlay text, and commit messages (`GANASTE`, `PERDISTE`,
  `VIDAS`, `Flechas para moverte.`). Identifiers and filenames stay English/ASCII (no accents).
- Each file opens with a comment stating its role and which globals it depends on — keep that.

## Workflow: spec-driven, via the `spec` / `spec-impl` skills

This repo is a spec-driven-development exercise (see `README.md`). All non-trivial work goes
through the two skills by Fernando Herrera, installed at `~/.agents/skills/spec/` and
`~/.agents/skills/spec-impl/`. Load them with the skill tool when a task matches; read their
`SKILL.md` before improvising any of the steps below.

- **New feature or behaviour change** -> `spec`. It only interviews you and writes
  `specs/NN-slug.md`; it must never write code. Files are numbered from `01`, zero-padded
  (`specs/01-mvp-arkanoid.md`) and are left in state `Draft` — only the human flips them to
  `Approved`. The spec's language must match the existing specs in `specs/`.
- **Implementing an approved spec** -> `spec-impl`. It refuses to run unless the spec's state
  means "Approved" (`Approved`, `Aprobado`, ...), then creates/switches to branch
  `spec-NN-slug` (`AutoCreateBranch` in `specs/.spec-config.yml`, default `true`), implements one
  plan step per turn with a pause for diff review, and **never commits** — commits are the user's
  call. Deviations or out-of-scope requests go back into the spec, not into the code.
- Both skills set `disable-model-invocation`, so the user normally types `/spec <feature>` or
  `/spec-impl NN-slug` themselves. If a feature request arrives directly, **do not start coding**:
  point the user at `/spec` first.
- `spec` reads this file as project memory (after `CLAUDE.md`, which this repo does not have), so
  keep it accurate. Specs belong in `specs/`, never in `src/`. Neither `specs/` nor
  `specs/.spec-config.yml` exists yet — `/spec` seeds the config on first run, so the first spec is
  `01-`.