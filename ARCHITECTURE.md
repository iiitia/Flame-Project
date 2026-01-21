# Architecture

## System overview
- Client: HTML5 Canvas for rendering; Socket.io client for realtime; thin state manager in `main.js` + `canvas.js`.
- Server: Node.js + Express static hosting + Socket.io for realtime; room manager in `rooms.js`; history + undo/redo in `drawing-state.js`.
- Data model: authoritative history of strokes per room; redo stack per room.

## Data flow
1. Client joins a room via `client:join`.
2. Server returns `server:joined` with current users + strokes.
3. During draw: client emits `client:stroke-start` -> server broadcasts `server:stroke-start`; subsequent `client:stroke-chunk` stream points; `client:stroke-end` finalizes.
4. Undo/Redo: client emits `client:undo` / `client:redo`; server mutates history and broadcasts `server:undo` / `server:redo`.
5. Cursors: client emits `client:cursor`; server fan-outs `server:cursor`.

## WebSocket protocol
- `client:join { roomId, userName, color }` → `server:joined { roomId, user, state }`
- `server:user-joined { user }`, `server:user-left { userId }`
- `client:stroke-start { roomId, stroke }` → `server:stroke-start { stroke }`
- `client:stroke-chunk { roomId, strokeId, points[] }` → `server:stroke-chunk { strokeId, points[] }`
- `client:stroke-end { roomId, strokeId, points[] }` → `server:stroke-end { strokeId, points[] }`
- `client:undo { roomId }` → `server:undo { strokeId }`
- `client:redo { roomId }` → `server:redo { stroke }`
- `client:cursor { roomId, position }` → `server:cursor { userId, position, ts }`
- `server:error { message }`

## Canvas state model
- `strokes[]`: committed strokes `{ id, userId, tool, color, width, points[] }`
- `redoStack[]`: undone strokes available to restore
- `live map`: in-progress strokes keyed by id (captures streaming chunks)

## Undo/Redo algorithm
1. On stroke start: create live stroke; not yet in history.
2. On stroke end: move live stroke into `strokes[]`; clear `redoStack`.
3. Undo: pop last stroke from `strokes[]`, push to `redoStack`, broadcast `server:undo` with strokeId.
4. Redo: pop from `redoStack`, push to `strokes[]`, broadcast `server:redo` with stroke.
5. Clients, upon undo/redo, replay strokes to rebuild canvas, ensuring global ordering.

Conflict handling: undo always targets last global stroke; users may undo others’ work. Consistency preserved because server is authoritative; clients reconcile by replaying canonical history.

## Rendering strategy
- Streaming chunks draw immediately on canvas for responsiveness.
- On undo/redo, client clears canvas and replays strokes list from server state.
- Cursors drawn on overlay canvas to avoid interfering with strokes.

## Scaling strategy
- Rooms: isolate state; use sticky sessions if sharded.
- Optimize broadcast: batch stroke chunks (16–32 ms) when user counts rise.
- Persistence: back strokes to Redis/Postgres for recovery; snapshot periodically.
- Horizontal scale: move Socket.io to Redis adapter for multi-instance fan-out.
- Rate limiting: token bucket per socket for stroke chunks + cursor spam.
- Large canvases: add quadtree tile rendering or server-side vector persistence with client-side tile replay.
