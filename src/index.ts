import { ITransportClient, ITransportServer } from "./interface";
import { WebSocket, WebSocketServer } from "ws";
import { v4 as uuid } from "uuid";
import { Server as HTTPServer } from "http";
import { URL } from "url";
type TrasportServerOptions = {
  port?: number;
  server?: HTTPServer;
  path?: string;
  callback?: () => void;
};

type TransportListener = {
  event: string;
  once?: boolean;
  listener: (data?: any) => void;
};

export class TransportServer implements ITransportServer {
  private _server: WebSocketServer;
  private _connectListener?: (ws: TransportSocketClient) => void;
  private _clients: TransportSocketClient[] = [];

  constructor(options: TrasportServerOptions) {
    if (!options.port && !options.server)
      throw new Error("Yo should specify either a server or a port");

    if (options.port && options.server)
      throw new Error("You can either specify a server or a port, not both");

    this._server = new WebSocketServer(
      { port: options.port },
      options.callback
    );
    // Register connection listener
    this._server.on("connection", (ws: WebSocket) => {
      const client = new TransportSocketClient(ws, this);
      this._clients.push(client);
      if (this._connectListener) this._connectListener(client);
    });
    //handle upgrades from the server
    if (options.server && options.path)
      options.server.on("upgrade", (request, socket, head) => {
        const pathname = request.url ? new URL(request.url!).pathname : "/";
        if (options.path !== pathname) return socket.destroy();

        this._server.handleUpgrade(request, socket, head, (ws) => {
          this._server.emit("connection", ws, request);
        });
      });
  }

  get clients() {
    return this._clients;
  }

  removeClient(client: TransportSocketClient) {
    this._clients = this.clients.filter((c) => c.id !== client.id);
  }

  onConnect(listener: (socket: TransportSocketClient) => void) {
    this._connectListener = listener;
  }

  onError(listener: (error: Error) => void) {
    this._server.on("error", listener);
  }

  onClose(listener: () => void) {
    this._server.on("close", listener);
  }
}

export class TransportSocketClient implements ITransportClient {
  private _id = uuid();
  private _server: TransportServer;
  private _rooms: string[] = [];
  private _socket: WebSocket;
  private _listeners: TransportListener[] = [];
  private _closeListener?: () => void;

  constructor(ws: WebSocket, server: TransportServer) {
    this._socket = ws;
    this._server = server;

    //Register the listeners,
    this._socket.on("close", () => {
      this._socket.removeAllListeners();
      this._server.removeClient(this);
      if (this._closeListener) this._closeListener();
    });
    this._socket.on("message", (data) => {
      try {
        const event = JSON.parse(data.toString());
        if (typeof event.event !== "string") throw new Error();
        const listeners = this._listeners;
        for (let i = 0; i < listeners.length; i++) {
          if (listeners[i].event !== event.event) continue;
          listeners[i].listener(event.data);
        }
      } catch (e) {
        console.log(e);
        return;
      }
    });
  }

  get id(): string {
    return this._id;
  }

  get state() {
    return this._socket.readyState;
  }

  get rooms(): string[] {
    return this._rooms;
  }

  on(event: string, listener: (data?: any) => void) {
    this._listeners = [...this._listeners, { event, listener }];
  }

  once(event: string, listener: (data: any) => void) {
    const listenerWithRemoval = (data: any) => {
      listener(data);
      let newListeners: TransportListener[] = [];
      for (let i = 0; i < this._listeners.length; i++) {
        if (
          this._listeners[i].event !== event ||
          this._listeners[i].listener !== listenerWithRemoval
        )
          newListeners.push();
      }
      this._listeners = newListeners;
    };

    this._listeners.push({
      event,
      listener: listenerWithRemoval,
    });
  }

  onClose(listener: () => void) {
    this._closeListener = listener;
  }

  onError(listener: (event: ErrorEvent) => void) {
    this._socket.on("error", listener);
  }

  off(event: string, listener: (data?: any) => void) {
    this._listeners = this._listeners.filter(
      (el) => el.event !== event || el.listener !== listener
    );
  }

  emit(event: string, data?: any) {
    this._socket.send(JSON.stringify({ event, data }));
  }

  broadcast(event: string, data?: any) {
    const clients = this._server.clients;
    for (let i = 0; i < clients.length; i++) {
      if (clients[i].id !== this._id) clients[i].emit(event, data);
    }
  }

  emitToRoom(room: string, event: string, data?: any) {
    const clients = this._server.clients;
    for (let i = 0; i < clients.length; i++) {
      if (
        clients[i].id !== this._id &&
        clients[i].rooms.find((r) => room === r)
      )
        clients[i].emit(event, data);
    }
  }

  join(room: string) {
    if (this._rooms.find((r) => r === room)) return;
    this._rooms.push(room);
  }

  leave(room: string) {
    this._rooms = this._rooms.filter((r) => r !== room);
  }
}
