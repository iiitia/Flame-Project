# Collaborative Canvas
link:https://flame-project-1.onrender.com
Real-time multi-user drawing app with HTML5 Canvas, Socket.io, and global undo/redo.

## Setup

```bash
npm install
npm start
```

Server runs at http://localhost:3000 and serves the client.

## Usage

1. Open http://localhost:3000 in two or more browser windows.  
2. Choose a room id and name, click Join.  
3. Draw with Brush/Eraser, change color/width.  
4. Undo/Redo is global (last operation wins, cross-user).  
5. Export PNG via the button.

## Features

- Live stroke streaming while drawing (point chunks).  
- Brush, Eraser, Highlighter, Line, Rectangle, Circle, Text tools.  
- Cursor indicators for other users.  
- Global undo/redo with server-authoritative history.  
- Room-based canvases.  
- Latency + FPS indicators.  
- Simple PNG export.

## Known limitations

- No persistence to disk/DB.  
- Redraw on undo/redo is full replay, fine for 100s strokes but not large artboards.  
- Basic rate limiting only via Socket.io backpressure; add token-bucket for abuse resistance.  
- No auth; rooms are open.

## Performance notes

- Stroke chunks throttle naturally by requestAnimationFrame on the client.  
- Server broadcasts chunks as-received; could batch by 16–32 ms if needed.  
- Canvas re-render on undo/redo uses full stroke list; offscreen caching can optimize.

## Testing with multiple users

- Open multiple tabs or devices to http://localhost:3000 using the same room id.  
- Simulate latency with Chrome devtools throttling; strokes remain consistent because server is authoritative.

## Time & complexity trade-offs

- Chose Socket.io for reliability and reconnection handling.  
- Stroke-level operations with streaming point chunks balance smoothness and history size.  
- Undo/redo kept server-side for consistency; client replays state to stay in sync.
