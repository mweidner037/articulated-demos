export class WebSocketClient {
  ws: WebSocket;
  onMessage?: (message: string) => void;

  private _testConnected = true;
  private sendQueue: string[] = [];
  private receiveQueue: string[] = [];

  constructor(readonly wsUrl: string) {
    this.ws = new WebSocket(wsUrl);
    this.ws.addEventListener("message", (e) => this.messageHandler(e));
  }

  private messageHandler(event: MessageEvent<string>): void {
    const message = event.data;
    if (this._testConnected) {
      this.onMessage?.(message);
    } else {
      this.receiveQueue.push(message);
    }
  }

  private sendInternal(message: string): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      console.log("WebSocket not open, skipping send");
    }
  }

  send(message: string): void {
    if (this._testConnected) {
      this.sendInternal(message);
    } else {
      this.sendQueue.push(message);
    }
  }

  set testConnected(connected: boolean) {
    if (connected !== this._testConnected) {
      this._testConnected = connected;
      if (connected) {
        for (const message of this.sendQueue) {
          this.sendInternal(message);
        }
        this.sendQueue = [];

        const toReceive = this.receiveQueue;
        this.receiveQueue = [];
        for (const message of toReceive) {
          this.onMessage?.(message);
        }
      }
    }
  }

  get testConnected(): boolean {
    return this._testConnected;
  }
}
