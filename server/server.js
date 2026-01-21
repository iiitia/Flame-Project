const path = require('path');
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const Rooms = require('./rooms');

const PORT = process.env.PORT || 3000;
const CLIENT_DIR = path.join(__dirname, '..', 'client');

const app = express();
app.use(cors());
app.use(express.static(CLIENT_DIR));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingInterval: 20000,
  pingTimeout: 20000,
});

const rooms = new Rooms();

io.on('connection', socket => {
  socket.on('client:join', payload => {
    try {
      const { roomId, userName, color } = payload || {};
      if (!roomId) {
        socket.emit('server:error', { message: 'roomId required' });
        return;
      }
      const user = rooms.addUser(roomId, socket.id, userName, color);
      socket.join(roomId);

      socket.emit('server:joined', {
        roomId,
        user,
        state: rooms.getRoomState(roomId),
      });
      socket.to(roomId).emit('server:user-joined', { user });
    } catch (err) {
      socket.emit('server:error', { message: err.message || 'join failed' });
    }
  });

  socket.on('client:cursor', ({ roomId, position }) => {
    if (!roomId || !position) return;
    const user = rooms.markActivity(roomId, socket.id);
    if (user) {
      socket.to(roomId).emit('server:presence', {
        userId: user.id,
        presence: user.presence,
        lastSeen: user.lastSeen,
      });
    }
    socket.to(roomId).emit('server:cursor', {
      userId: socket.id,
      position,
      ts: Date.now(),
    });
  });

  socket.on('client:stroke-start', ({ roomId, stroke }) => {
    if (!roomId || !stroke) return;
    const user = rooms.markActivity(roomId, socket.id);
    if (user) {
      io.to(roomId).emit('server:presence', {
        userId: user.id,
        presence: user.presence,
        lastSeen: user.lastSeen,
      });
    }
    const persisted = rooms.startStroke(roomId, socket.id, stroke);
    if (!persisted) return;
    io.to(roomId).emit('server:stroke-start', persisted);
  });

  socket.on('client:stroke-chunk', ({ roomId, strokeId, points }) => {
    if (!roomId || !strokeId || !Array.isArray(points)) return;
    rooms.markActivity(roomId, socket.id);
    const updated = rooms.appendStrokePoints(roomId, strokeId, points);
    if (!updated) return;
    socket.to(roomId).emit('server:stroke-chunk', { strokeId, points });
  });

  socket.on('client:stroke-end', ({ roomId, strokeId, points }) => {
    if (!roomId || !strokeId) return;
    rooms.markActivity(roomId, socket.id);
    const finalized = rooms.finalizeStroke(roomId, strokeId, points);
    if (!finalized) return;
    io.to(roomId).emit('server:stroke-end', { strokeId, points });
  });

  socket.on('client:undo', ({ roomId }) => {
    if (!roomId) return;
    const op = rooms.undo(roomId);
    if (!op) return;
    io.to(roomId).emit('server:undo', { strokeId: op.id });
  });

  socket.on('client:redo', ({ roomId }) => {
    if (!roomId) return;
    const op = rooms.redo(roomId);
    if (!op) return;
    io.to(roomId).emit('server:redo', op);
  });

  socket.on('client:presence', ({ roomId, presence }) => {
    if (!roomId) return;
    const user = rooms.setPresence(roomId, socket.id, presence);
    if (!user) return;
    io.to(roomId).emit('server:presence', {
      userId: user.id,
      presence: user.presence,
      lastSeen: user.lastSeen,
    });
  });

  socket.on('disconnect', () => {
    const left = rooms.removeUser(socket.id);
    if (left) {
      const { roomId, user } = left;
      socket.to(roomId).emit('server:user-left', { userId: user.id, lastSeen: Date.now() });
    }
  });

  // latency probe (optional; socket.io also has built-in ping/pong)
  socket.on('ping', callback => {
    if (typeof callback === 'function') callback();
  });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'index.html'));
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${PORT}`);
});
