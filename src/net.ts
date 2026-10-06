// The connection to the host's relay server (server/host.mjs). Messages are small JSON objects.

export interface PlayerInfo { id: number; name: string; racing: boolean; ready: boolean }
export interface RankRow { id: number; name: string; score: number }

export type ServerMessage =
  | { t: 'welcome'; id: number }
  | { t: 'players'; phase: 'lobby' | 'racing' | 'results'; list: PlayerInfo[] }
  | { t: 'go'; seed: number; startIn: number; racers: number }
  | { t: 'state'; id: number; y: number; s: number; j: boolean; d: boolean }
  | { t: 'dead'; id: number; s: number }
  | { t: 'results'; ranking: RankRow[] }
  | { t: 'full'; max: number };

export type ClientMessage =
  | { t: 'hello' | 'name'; name: string }
  | { t: 'ready'; on: boolean }
  | { t: 'start' | 'lobby' }
  | { t: 'state'; y: number; s: number; j: boolean; d: boolean }
  | { t: 'dead'; s: number };

/** What the host's `/lan.json` says; absent when the page is not served by the host (e.g. GitHub Pages). */
export interface HostInfo { lan: true; max: number; urls: string[] }

export async function probeHost(): Promise<HostInfo | null> {
  try {
    const res = await fetch('lan.json', { cache: 'no-store' });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
    const info = (await res.json()) as HostInfo;
    return info.lan ? info : null;
  } catch {
    return null;
  }
}

export class Net {
  private ws: WebSocket | null = null;
  onMessage: (m: ServerMessage) => void = () => {};
  onClose: () => void = () => {};

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://${location.host}/ws`);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => {
        if (this.ws === ws) this.ws = null; // a failed attempt is reported by the rejection, not by onClose
        reject(new Error('Could not connect'));
      };
      ws.onmessage = (e) => {
        try {
          this.onMessage(JSON.parse(String(e.data)) as ServerMessage);
        } catch {
          /* ignore garbage */
        }
      };
      ws.onclose = () => {
        if (this.ws !== ws) return; // closed on purpose
        this.ws = null;
        this.onClose();
      };
    });
  }

  send(m: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  close(): void {
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
