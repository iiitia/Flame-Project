class DrawingState {
  constructor() {
    this.strokes = [];
    this.redoStack = [];
    this.live = new Map();
  }

  startStroke(stroke) {
    this.live.set(stroke.id, stroke);
  }

  appendPoints(strokeId, points) {
    const stroke = this.live.get(strokeId);
    if (!stroke) return null;
    stroke.points.push(...points);
    return stroke;
  }

  finalizeStroke(strokeId, points = []) {
    const stroke = this.live.get(strokeId);
    if (!stroke) return null;
    if (points.length) stroke.points.push(...points);
    stroke.committed = true;
    this.strokes.push(stroke);
    this.live.delete(strokeId);
    this.redoStack = [];
    return stroke;
  }

  undo() {
    if (!this.strokes.length) return null;
    const removed = this.strokes.pop();
    this.redoStack.push(removed);
    return removed;
  }

  redo() {
    if (!this.redoStack.length) return null;
    const restored = this.redoStack.pop();
    this.strokes.push(restored);
    return restored;
  }

  getCommittedStrokes() {
    return this.strokes.map(s => ({ ...s }));
  }
}

module.exports = DrawingState;
