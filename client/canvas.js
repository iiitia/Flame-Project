class CanvasManager {
  constructor(canvas, overlay) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.ctx = canvas.getContext('2d');
    this.overlayCtx = overlay.getContext('2d');
    this.currentTool = 'brush';
    this.color = '#1d4ed8';
    this.width = 4;
    this.isDrawing = false;
    this.points = [];
    this.strokeId = null;
    this.onStrokeStart = () => {};
    this.onStrokeChunk = () => {};
    this.onStrokeEnd = () => {};
    this.onCursor = () => {};
    this.onTextRequest = () => {};
    this.remoteCursors = new Map();
    this.remoteStrokes = new Map();
    this.fps = 0;
    this.lastFrame = performance.now();
    this.frame();
    this.bind();
  }

  bind() {
    const start = e => {
      const pos = this.getPos(e);
      this.onCursor(pos);

      if (this.currentTool === 'text') {
        this.onTextRequest(pos);
        return;
      }

      this.isDrawing = true;
      this.points = [pos];
      this.strokeId = this.makeId();

      const stroke = this.makeStroke({ id: this.strokeId, points: [pos] });
      this.onStrokeStart(stroke);

      if (this.isFreehand(stroke.tool)) {
        this.drawStroke(this.ctx, stroke);
      }
    };

    const move = e => {
      const pos = this.getPos(e);
      this.onCursor(pos);
      if (!this.isDrawing) return;

      if (this.isFreehand(this.currentTool)) {
        this.points.push(pos);
        if (this.points.length > 1) {
          const chunk = this.points.slice(-2);
          this.drawSegment(this.ctx, chunk, this.currentTool, this.color, this.width);
          this.onStrokeChunk({ strokeId: this.strokeId, points: chunk });
        }
        return;
      }

      // shape preview on overlay
      const startPt = this.points[0];
      this.overlayCtx.clearRect(0, 0, this.overlay.width, this.overlay.height);
      this.drawShape(this.overlayCtx, this.currentTool, startPt, pos, this.color, this.width, true);
    };

    const end = e => {
      if (!this.isDrawing) return;
      this.isDrawing = false;

      if (this.isFreehand(this.currentTool)) {
        this.onStrokeEnd({ strokeId: this.strokeId, points: [] });
      } else {
        const endPos = e ? this.getPos(e) : this.points[this.points.length - 1];
        const stroke = this.makeStroke({ id: this.strokeId, points: [this.points[0], endPos] });
        this.overlayCtx.clearRect(0, 0, this.overlay.width, this.overlay.height);
        this.drawStroke(this.ctx, stroke);
        this.onStrokeEnd({ strokeId: stroke.id, points: [endPos] });
      }

      this.points = [];
      this.strokeId = null;
    };

    this.canvas.addEventListener('mousedown', start);
    this.canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    this.canvas.addEventListener('mouseleave', () => {
      if (this.isDrawing && this.isFreehand(this.currentTool)) end();
    });

    this.canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      start(e.touches[0]);
    });
    this.canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      move(e.touches[0]);
    });
    this.canvas.addEventListener('touchend', e => {
      e.preventDefault();
      end(e.changedTouches[0]);
    });
  }

  setTool(tool) {
    this.currentTool = tool;
  }

  setColor(color) {
    this.color = color;
  }

  setWidth(width) {
    this.width = width;
  }

  setBaseStrokes(strokes) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    strokes.forEach(s => this.drawStroke(this.ctx, s));
  }

  addRemoteStrokeStart(stroke) {
    this.remoteStrokes.set(stroke.id, { ...stroke, points: [...(stroke.points || [])] });
    if (this.isFreehand(stroke.tool) && stroke.points?.length) {
      this.drawStroke(this.ctx, stroke);
    }
  }

  addRemoteStrokeChunk({ strokeId, points }) {
    const stroke = this.remoteStrokes.get(strokeId);
    if (!stroke) return;
    stroke.points.push(...points);
    if (this.isFreehand(stroke.tool)) {
      this.drawSegment(this.ctx, points, stroke.tool, stroke.color, stroke.width);
    }
  }

  finalizeRemoteStroke({ strokeId, points }) {
    const stroke = this.remoteStrokes.get(strokeId);
    if (!stroke) return;
    stroke.points.push(...(points || []));
    this.drawStroke(this.ctx, stroke);
    this.remoteStrokes.delete(strokeId);
  }

  undoStroke(strokeId) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.remoteStrokes.delete(strokeId);
  }

  drawStroke(ctx, stroke) {
    if (!stroke.points || !stroke.points.length) return;

    if (stroke.tool === 'text') {
      ctx.save();
      ctx.fillStyle = stroke.color;
      ctx.font = `${Math.max(14, stroke.width * 4)}px 'Inter', sans-serif`;
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 8;
      const pos = stroke.points[0];
      ctx.fillText(stroke.text || 'Text', pos.x, pos.y);
      ctx.restore();
      return;
    }

    if (!this.isFreehand(stroke.tool)) {
      const [start, end] = stroke.points;
      this.drawShape(ctx, stroke.tool, start, end, stroke.color, stroke.width, false);
      return;
    }

    if (stroke.points.length < 2) return;

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = stroke.tool === 'eraser' ? '#000000' : stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : stroke.tool === 'highlighter' ? 'multiply' : 'source-over';
    ctx.globalAlpha = stroke.tool === 'highlighter' ? 0.35 : 1;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      const p = stroke.points[i];
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawSegment(ctx, points, tool, color, width) {
    if (!points || points.length < 2) return;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = tool === 'eraser' ? '#000000' : color;
    ctx.lineWidth = width;
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : tool === 'highlighter' ? 'multiply' : 'source-over';
    ctx.globalAlpha = tool === 'highlighter' ? 0.35 : 1;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.stroke();
    ctx.restore();
  }

  drawShape(ctx, tool, start, end, color, width, dashed = false) {
    if (!start || !end) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.setLineDash(dashed ? [8, 6] : []);
    if (tool === 'line') {
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    } else if (tool === 'rect') {
      const w = end.x - start.x;
      const h = end.y - start.y;
      ctx.strokeRect(start.x, start.y, w, h);
    } else if (tool === 'circle') {
      const radius = Math.hypot(end.x - start.x, end.y - start.y);
      ctx.beginPath();
      ctx.arc(start.x, start.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  renderCursors(cursors) {
    this.overlayCtx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    cursors.forEach(cursor => {
      this.overlayCtx.fillStyle = cursor.color;
      this.overlayCtx.beginPath();
      this.overlayCtx.arc(cursor.position.x, cursor.position.y, 4, 0, Math.PI * 2);
      this.overlayCtx.fill();
      this.overlayCtx.fillText(cursor.name, cursor.position.x + 8, cursor.position.y - 8);
    });
  }

  getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (e.clientY - rect.top) * (this.canvas.height / rect.height),
    };
  }

  makeId() {
    return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  }

  makeStroke({ id, points, text }) {
    return {
      id: id || this.makeId(),
      color: this.currentTool === 'eraser' ? '#000000' : this.color,
      width: this.width,
      tool: this.currentTool,
      points: points || [],
      text,
    };
  }

  isFreehand(tool) {
    return tool === 'brush' || tool === 'eraser' || tool === 'highlighter';
  }

  frame() {
    requestAnimationFrame(this.frame.bind(this));
    const now = performance.now();
    const delta = now - this.lastFrame;
    this.fps = Math.round(1000 / delta);
    this.lastFrame = now;
  }
}

window.CanvasManager = CanvasManager;
