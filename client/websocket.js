class SocketClient {
  constructor() {
    this.socket = null;
    this.handlers = {};
    this.latencyCb = null;
    this.pingInterval = null;
  }

  connect() {
    this.socket = io();
    this.registerCore();
  }

  join(roomId, userName, color) {
    this.socket.emit('client:join', { roomId, userName, color });
  }

  on(event, cb) {
    this.handlers[event] = cb;
  }

  emit(event, payload) {
    this.socket.emit(event, payload);
  }

  registerCore() {
    this.socket.on('connect', () => this.handlers['connect']?.());
    this.socket.on('disconnect', () => this.handlers['disconnect']?.());
    this.socket.on('server:joined', data => this.handlers['joined']?.(data));
    this.socket.on('server:user-joined', data => this.handlers['user-joined']?.(data));
    this.socket.on('server:user-left', data => this.handlers['user-left']?.(data));
    this.socket.on('server:cursor', data => this.handlers['cursor']?.(data));
    this.socket.on('server:presence', data => this.handlers['presence']?.(data));
    this.socket.on('server:stroke-start', data => this.handlers['stroke-start']?.(data));
    this.socket.on('server:stroke-chunk', data => this.handlers['stroke-chunk']?.(data));
    this.socket.on('server:stroke-end', data => this.handlers['stroke-end']?.(data));
    this.socket.on('server:undo', data => this.handlers['undo']?.(data));
    this.socket.on('server:redo', data => this.handlers['redo']?.(data));
    this.socket.on('server:error', data => this.handlers['error']?.(data));
    this.startLatencyProbe();
  }

  startLatencyProbe() {
    const ping = () => {
      const start = performance.now();
      this.socket.timeout(5000).emit('ping', () => {
        const latency = Math.round(performance.now() - start);
        this.latencyCb?.(latency);
      });
    };
    this.latencyCb = null;
    this.socket.on('pong', () => {});
    this.pingInterval = setInterval(ping, 4000);
    ping();
  }

  onLatency(cb) {
    this.latencyCb = cb;
  }
}

window.SocketClient = SocketClient;
