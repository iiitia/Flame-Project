const DrawingState = require('./drawing-state');
const { v4: uuid } = require('uuid');

class Rooms {
  constructor() {
    this.rooms = new Map();
    this.socketToRoom = new Map();
  }

  getOrCreate(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        id: roomId,
        users: new Map(),
        drawing: new DrawingState(),
      });
    }
    return this.rooms.get(roomId);
  }

  addUser(roomId, socketId, name, color) {
    const room = this.getOrCreate(roomId);
    const now = Date.now();
    const user = {
      id: socketId,
      name: name || `User-${socketId.slice(-4)}`,
      color: color || this.pickColor(room),
      joinedAt: now,
      lastSeen: now,
      presence: 'active', // active | observing
    };
    room.users.set(socketId, user);
    this.socketToRoom.set(socketId, roomId);
    return user;
  }

  removeUser(socketId) {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return null;
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const user = room.users.get(socketId);
    room.users.delete(socketId);
    this.socketToRoom.delete(socketId);
    if (room.users.size === 0) {
      this.rooms.delete(roomId);
    }
    return { roomId, user };
  }

  getUser(roomId, userId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return room.users.get(userId) || null;
  }

  markActivity(roomId, userId) {
    const user = this.getUser(roomId, userId);
    if (!user) return null;
    user.lastSeen = Date.now();
    if (user.presence !== 'observing') user.presence = 'active';
    return user;
  }

  setPresence(roomId, userId, presence) {
    const user = this.getUser(roomId, userId);
    if (!user) return null;
    if (presence === 'observing') user.presence = 'observing';
    else user.presence = 'active';
    user.lastSeen = Date.now();
    return user;
  }

  pickColor(room) {
    const palette = [
      '#ff6b6b',
      '#feca57',
      '#48dbfb',
      '#1dd1a1',
      '#5f27cd',
      '#ff9ff3',
      '#54a0ff',
      '#00d2d3',
      '#c8d6e5',
      '#576574',
    ];
    const used = new Set([...room.users.values()].map(u => u.color));
    return palette.find(c => !used.has(c)) || palette[Math.floor(Math.random() * palette.length)];
  }

  getRoomState(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return { users: [], strokes: [] };
    return {
      users: [...room.users.values()],
      strokes: room.drawing.getCommittedStrokes(),
    };
  }

  startStroke(roomId, userId, stroke) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const id = stroke.id || uuid();
    const normalized = {
      id,
      userId,
      color: stroke.color,
      width: stroke.width,
      tool: stroke.tool,
      text: stroke.text,
      points: stroke.points || [],
      startedAt: Date.now(),
      committed: false,
    };
    room.drawing.startStroke(normalized);
    return normalized;
  }

  appendStrokePoints(roomId, strokeId, points) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return room.drawing.appendPoints(strokeId, points);
  }

  finalizeStroke(roomId, strokeId, points) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return room.drawing.finalizeStroke(strokeId, points);
  }

  undo(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return room.drawing.undo();
  }

  redo(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return room.drawing.redo();
  }
}

module.exports = Rooms;
