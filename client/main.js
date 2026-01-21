(() => {
  const canvasEl = document.getElementById('canvas');
  const overlayEl = document.getElementById('overlay');
  const statusEl = document.getElementById('status');
  const usersEl = document.getElementById('users');
  const roomInput = document.getElementById('room-id');
  const nameInput = document.getElementById('user-name');
  const colorPicker = document.getElementById('color-picker');
  const widthPicker = document.getElementById('width-picker');
  const eraserWidthPicker = document.getElementById('eraser-width-picker');
  const latencyEl = document.getElementById('latency');
  const fpsEl = document.getElementById('fps');
  const presenceBtn = document.getElementById('presence-btn');

  const socket = new SocketClient();
  socket.connect();

  const canvas = new CanvasManager(canvasEl, overlayEl);
  const canvasWrapper = document.querySelector('.canvas-wrapper');

  const state = {
    roomId: 'lobby',
    user: null,
    users: new Map(),
    strokes: new Map(), // id -> stroke
    cursorPositions: new Map(),
    widths: {
      brush: Number(widthPicker.value) || 5,
      eraser: Number(eraserWidthPicker.value) || 12,
    },
    presence: {
      mode: 'active', // active | observing
    },
  };

  const cursors = {
    brush:
      'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2732%27 height=%2732%27 viewBox=%270 0 32 32%27%3E%3Cpath fill=%27%23ffffff%27 stroke=%27%23000000%27 stroke-width=%271.5%27 d=%27M6 26l6-6 8-10 4 4-10 8-6 6z%27/%3E%3C/svg%3E") 4 28, crosshair',
    eraser:
      'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2732%27 height=%2732%27 viewBox=%270 0 32 32%27%3E%3Crect x=%276%27 y=%278%27 width=%2716%27 height=%2712%27 rx=%272%27 ry=%272%27 fill=%27%23f8fafc%27 stroke=%27%23000000%27 stroke-width=%271.5%27 transform=%27rotate(-20 14 14)%27/%3E%3C/svg%3E") 8 24, crosshair',
    highlighter:
      'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2732%27 height=%2732%27 viewBox=%270 0 32 32%27%3E%3Cpath d=%27M8 22l10-12 6 6-12 10H8z%27 fill=%27%23fcd34d%27 stroke=%27%230f172a%27 stroke-width=%271.5%27/%3E%3C/svg%3E") 6 26, crosshair',
    line:
      'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2732%27 height=%2732%27 viewBox=%270 0 32 32%27%3E%3Cpath d=%27M6 26 L26 6%27 stroke=%27%23ffffff%27 stroke-width=%272.5%27/%3E%3C/svg%3E") 6 26, crosshair',
    rect:
      'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2732%27 height=%2732%27 viewBox=%270 0 32 32%27%3E%3Crect x=%276%27 y=%276%27 width=%2720%27 height=%2720%27 fill=%27none%27 stroke=%27%23ffffff%27 stroke-width=%272.5%27/%3E%3C/svg%3E") 4 28, crosshair',
    circle:
      'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2732%27 height=%2732%27 viewBox=%270 0 32 32%27%3E%3Ccircle cx=%2716%27 cy=%2716%27 r=%2710%27 fill=%27none%27 stroke=%27%23ffffff%27 stroke-width=%272.5%27/%3E%3C/svg%3E") 6 26, crosshair',
    text:
      'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2732%27 height=%2732%27 viewBox=%270 0 32 32%27%3E%3Ctext x=%276%27 y=%2722%27 font-size=%2720%27 font-family=%27Arial%27 fill=%27%23ffffff%27%3ET%3C/text%3E%3C/svg%3E") 6 26, text',
    default: 'crosshair',
  };

  function setCursor(tool) {
    canvasEl.style.cursor = cursors[tool] || cursors.default;
  }

  function applyWidthForTool(tool) {
    const isEraser = tool === 'eraser';
    canvas.setWidth(isEraser ? state.widths.eraser : state.widths.brush);
  }

  const PRESENCE_ACTIVE_MS = 10_000;
  const PRESENCE_IDLE_MS = 60_000;

  function derivePresence(user) {
    if (user.offline) return { key: 'offline', label: 'Offline 🔴' };
    if (user.presence === 'observing') return { key: 'observing', label: 'Observing 👀' };
    const lastSeen = user.lastSeen || user.joinedAt || 0;
    const age = Date.now() - lastSeen;
    if (age <= PRESENCE_ACTIVE_MS) return { key: 'active', label: 'Active 🟢' };
    return { key: 'idle', label: 'Idle 🟡' };
  }

  function refreshCanvas() {
    canvas.setBaseStrokes([...state.strokes.values()]);
  }

  function renderUsers() {
    usersEl.innerHTML = '';
    [...state.users.values()].forEach(u => {
      const li = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = 'color-dot';
      dot.style.background = u.color;
      li.appendChild(dot);

      const name = document.createElement('span');
      name.className = 'user-name';
      name.textContent = u.name;
      li.appendChild(name);

      const p = derivePresence(u);
      const presence = document.createElement('span');
      presence.className = `presence ${p.key}`;
      presence.textContent = p.label;
      li.appendChild(presence);

      usersEl.appendChild(li);
    });
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function joinRoom() {
    state.roomId = roomInput.value || 'lobby';
    socket.join(state.roomId, nameInput.value, colorPicker.value);
    setStatus(`Joining ${state.roomId}...`);
    socket.emit('client:presence', { roomId: state.roomId, presence: state.presence.mode });
  }

  socket.on('connect', () => setStatus('Connected'));
  socket.on('disconnect', () => setStatus('Disconnected'));
  socket.on('joined', ({ user, state: serverState }) => {
    state.user = user;
    state.users = new Map(serverState.users.map(u => [u.id, u]));
    state.strokes = new Map();
    (serverState.strokes || []).forEach(s => state.strokes.set(s.id, s));
    refreshCanvas();
    renderUsers();
    setStatus(`In room ${state.roomId} as ${user.name}`);
  });

  socket.on('user-joined', ({ user }) => {
    state.users.set(user.id, user);
    renderUsers();
  });

  socket.on('user-left', ({ userId, lastSeen }) => {
    const u = state.users.get(userId);
    if (u) {
      u.offline = true;
      u.lastSeen = lastSeen || Date.now();
      state.users.set(userId, u);
    }
    renderUsers();
  });

  socket.on('presence', ({ userId, presence, lastSeen }) => {
    const u = state.users.get(userId);
    if (!u) return;
    u.presence = presence;
    u.lastSeen = lastSeen || Date.now();
    u.offline = false;
    state.users.set(userId, u);
    renderUsers();
  });

  socket.on('cursor', payload => {
    const user = state.users.get(payload.userId);
    if (!user) return;
    user.lastSeen = payload.ts || Date.now();
    user.offline = false;
    if (user.presence !== 'observing') user.presence = 'active';
    state.users.set(payload.userId, user);
    state.cursorPositions.set(payload.userId, { ...payload, color: user.color, name: user.name });
    canvas.renderCursors(state.cursorPositions.values());
    renderUsers();
  });

  socket.on('stroke-start', stroke => {
    state.strokes.set(stroke.id, { ...stroke, points: [...(stroke.points || [])] });
    const u = state.users.get(stroke.userId);
    if (u) {
      u.lastSeen = Date.now();
      u.offline = false;
      if (u.presence !== 'observing') u.presence = 'active';
      state.users.set(stroke.userId, u);
      renderUsers();
    }
    if (stroke.userId === state.user?.id) return;
    canvas.addRemoteStrokeStart(stroke);
  });

  socket.on('stroke-chunk', ({ strokeId, points }) => {
    const stroke = state.strokes.get(strokeId);
    if (stroke) stroke.points.push(...points);
    canvas.addRemoteStrokeChunk({ strokeId, points });
  });

  socket.on('stroke-end', ({ strokeId, points }) => {
    const stroke = state.strokes.get(strokeId);
    if (stroke && points?.length) stroke.points.push(...points);
    if (stroke?.userId === state.user?.id) return;
    canvas.finalizeRemoteStroke({ strokeId, points });
  });

  socket.on('undo', ({ strokeId }) => {
    state.strokes.delete(strokeId);
    refreshCanvas();
  });

  socket.on('redo', stroke => {
    state.strokes.set(stroke.id, stroke);
    refreshCanvas();
  });

  socket.on('error', ({ message }) => setStatus(`Error: ${message}`));

  // Text tool: click to place, drag to reposition, Enter/blur to commit
  let textEditor = null;
  let textEditorPos = null; // canvas coords
  let dragging = false;
  let dragStart = null; // {mouseX, mouseY, left, top}

  function ensureTextEditor() {
    if (textEditor) return textEditor;
    const el = document.createElement('textarea');
    el.className = 'text-editor';
    el.rows = 1;
    el.placeholder = 'Type... (Enter to place)';
    el.style.display = 'none';
    canvasWrapper.appendChild(el);

    // Drag handling (so user can move text wherever before placing)
    el.addEventListener('mousedown', ev => {
      if (ev.button !== 0) return;
      dragging = true;
      el.classList.add('dragging');
      dragStart = {
        mouseX: ev.clientX,
        mouseY: ev.clientY,
        left: parseFloat(el.style.left || '0'),
        top: parseFloat(el.style.top || '0'),
      };
      ev.preventDefault();
    });

    window.addEventListener('mousemove', ev => {
      if (!dragging || !dragStart) return;
      const dx = ev.clientX - dragStart.mouseX;
      const dy = ev.clientY - dragStart.mouseY;
      const left = dragStart.left + dx;
      const top = dragStart.top + dy;
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      textEditorPos = toCanvasPosFromWrapper(left, top);
    });

    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      el.classList.remove('dragging');
      dragStart = null;
    });

    // Commit on blur (click elsewhere)
    el.addEventListener('blur', () => {
      commitTextEditor();
    });

    // Commit on Enter; newline with Shift+Enter
    el.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        commitTextEditor();
      }
    });

    textEditor = el;
    return el;
  }

  function toWrapperPosFromCanvas(canvasPos) {
    const rect = canvasEl.getBoundingClientRect();
    const wrapperRect = canvasWrapper.getBoundingClientRect();
    const scaleX = rect.width / canvasEl.width;
    const scaleY = rect.height / canvasEl.height;
    return {
      left: (canvasPos.x * scaleX) + (rect.left - wrapperRect.left),
      top: (canvasPos.y * scaleY) + (rect.top - wrapperRect.top),
    };
  }

  function toCanvasPosFromWrapper(leftPx, topPx) {
    const rect = canvasEl.getBoundingClientRect();
    const wrapperRect = canvasWrapper.getBoundingClientRect();
    const scaleX = canvasEl.width / rect.width;
    const scaleY = canvasEl.height / rect.height;
    const x = (leftPx - (rect.left - wrapperRect.left)) * scaleX;
    const y = (topPx - (rect.top - wrapperRect.top)) * scaleY;
    return { x, y };
  }

  function openTextEditor(atCanvasPos) {
    const el = ensureTextEditor();
    textEditorPos = atCanvasPos;
    const { left, top } = toWrapperPosFromCanvas(atCanvasPos);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.display = 'block';
    const fontPx = Math.max(14, (canvas.width || state.widths.brush) * 4);
    el.style.fontSize = `${fontPx}px`;
    el.style.color = canvas.color;
    el.value = '';
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 4}px`;
    el.focus();
  }

  function commitTextEditor() {
    if (!textEditor || textEditor.style.display === 'none') return;
    const text = (textEditor.value || '').trim();
    const pos = textEditorPos;
    textEditor.style.display = 'none';
    textEditor.value = '';
    if (!text || !pos) return;

    const stroke = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      tool: 'text',
      color: canvas.color,
      width: canvas.width || state.widths.brush,
      points: [pos],
      text,
      userId: state.user?.id,
    };

    // Render locally + send to server
    canvas.drawStroke(canvas.ctx, stroke);
    state.strokes.set(stroke.id, stroke);
    socket.emit('client:stroke-start', { roomId: state.roomId, stroke });
    socket.emit('client:stroke-end', { roomId: state.roomId, strokeId: stroke.id, points: [] });
  }

  canvas.onStrokeStart = stroke => {
    stroke.userId = state.user?.id;
    state.strokes.set(stroke.id, stroke);
    socket.emit('client:stroke-start', { roomId: state.roomId, stroke });
  };

  canvas.onStrokeChunk = ({ strokeId, points }) => {
    const stroke = state.strokes.get(strokeId);
    if (stroke) stroke.points.push(...points);
    socket.emit('client:stroke-chunk', { roomId: state.roomId, strokeId, points });
  };

  canvas.onStrokeEnd = ({ strokeId, points }) => {
    const stroke = state.strokes.get(strokeId);
    if (stroke && points?.length) stroke.points.push(...points);
    socket.emit('client:stroke-end', { roomId: state.roomId, strokeId, points });
  };

  canvas.onCursor = pos => {
    socket.emit('client:cursor', { roomId: state.roomId, position: pos });
  };

  canvas.onTextRequest = pos => {
    openTextEditor(pos);
  };

  document.querySelectorAll('.tool').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      canvas.setTool(btn.dataset.tool);
      setCursor(btn.dataset.tool);
      applyWidthForTool(btn.dataset.tool);
    });
  });

  colorPicker.addEventListener('change', e => {
    canvas.setColor(e.target.value);
  });

  widthPicker.addEventListener('input', e => {
    state.widths.brush = Number(e.target.value);
    if (canvas.currentTool !== 'eraser') {
      canvas.setWidth(state.widths.brush);
    }
  });

  eraserWidthPicker.addEventListener('input', e => {
    state.widths.eraser = Number(e.target.value);
    if (canvas.currentTool === 'eraser') {
      canvas.setWidth(state.widths.eraser);
    }
  });

  document.getElementById('undo-btn').addEventListener('click', () => {
    socket.emit('client:undo', { roomId: state.roomId });
  });

  document.getElementById('redo-btn').addEventListener('click', () => {
    socket.emit('client:redo', { roomId: state.roomId });
  });

  function syncPresenceButton() {
    presenceBtn.textContent = state.presence.mode === 'observing' ? '👀 Observing: On' : '👀 Observing: Off';
  }

  presenceBtn.addEventListener('click', () => {
    state.presence.mode = state.presence.mode === 'observing' ? 'active' : 'observing';
    syncPresenceButton();
    socket.emit('client:presence', { roomId: state.roomId, presence: state.presence.mode });
  });

  document.getElementById('join-btn').addEventListener('click', joinRoom);
  document.getElementById('export-btn').addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `canvas-${state.roomId}.png`;
    link.href = canvasEl.toDataURL('image/png');
    link.click();
  });

  socket.onLatency(latency => {
    latencyEl.textContent = `${latency} ms`;
  });

  setInterval(() => {
    fpsEl.textContent = `${canvas.fps} fps`;
  }, 500);

  // Presence re-derivation tick for idle/active transitions
  setInterval(() => {
    renderUsers();
  }, 2000);

  applyWidthForTool('brush');
  setCursor('brush');
  syncPresenceButton();
  joinRoom();
})();
