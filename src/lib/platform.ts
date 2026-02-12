
import WebSocket from 'ws';
import {
  MessageType,
  type AnyMessage,
  HEARTBEAT_INTERVAL
} from '@/shared';

export interface TerminalSession {
  id: string;
  status: string;
  shell?: string;
  created_at: number;
  updated_at?: number;
}

export const DEAULTE_SERVER_URL = 'https://termote.agi.build';

export async function fetchTerminalSession(
  serverUrl: string,
  deviceToken: string,
  sessionId: string,
) {
  try {
    const res = await fetch(`${serverUrl}/api/terminal/sessions/${sessionId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${deviceToken}`,
      },
    });

    if (!res.ok) {
      return null;
    }

    return (await res.json()) as TerminalSession;
  } catch {
    return null;
  }
}

export async function listTerminalSessions(serverUrl: string, accessToken: string): Promise<TerminalSession[]> {
  const res = await fetch(`${serverUrl}/api/terminal/sessions`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to list sessions: ${res.statusText}`);
  }

  const data = await res.json() as any;
  return data.sessions || data || [];
}


export async function createTerminalSession({
  serverUrl,
  deviceToken,
  shell,
}: {
  serverUrl: string;
  deviceToken: string;
  shell: string;
}) {
  const url = `${serverUrl}/api/terminal/sessions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${deviceToken}`,
    },
    body: JSON.stringify({ shell }),
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Authentication failed. Please run "termote login" again.');
    } else if (res.status === 404) {
      throw new Error(`API endpoint not found: ${url}\n\nThe server may not be running or the API has changed.`);
    } else if (res.status >= 500) {
      throw new Error('Server error. Please try again later.');
    }
    throw new Error(`Failed to create session (HTTP ${res.status}): ${res.statusText}`);
  }

  return (await res.json()) as any;
}


export async function deleteTerminalSession(serverUrl: string, accessToken: string, sessionId: string) {
  const res = await fetch(`${serverUrl}/api/terminal/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to stop session: ${res.statusText}`);
  }

  return res.json();
}

const RECONNECT_INITIAL_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;
const RECONNECT_BACKOFF_MULTIPLIER = 1.5;

export type WsClientCallbacks = {
  onMessage: (msg: AnyMessage) => void;
  onOpen: () => void;
  onClose: () => void;
  onReconnecting?: (attempt: number, delay: number) => void;
  onReconnected?: () => void;
};

export class WsClient {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private manualClose = false;
  private isConnecting = false;

  // Callbacks
  private callbacks: WsClientCallbacks = {
    onMessage: () => { },
    onOpen: () => { },
    onClose: () => { },
  };

  // Reconnect state
  private reconnectAttempts = 0;
  private reconnectDelay = RECONNECT_INITIAL_DELAY;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  connect(callbacks: WsClientCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
    this.manualClose = false;

    this.connectWebSocket();
  }

  private connectWebSocket() {
    if (this.isConnecting || (this.ws?.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;

    // Append role=agent and token to query params
    const wsUrl = new URL(this.url);
    wsUrl.searchParams.set('role', 'agent');

    this.ws = new WebSocket(wsUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });

    this.ws.on('open', () => {
      this.isConnecting = false;

      // If we were reconnecting, notify success
      if (this.reconnectAttempts > 0) {
        this.callbacks.onReconnected?.();
      }

      this.reconnectAttempts = 0;
      this.reconnectDelay = RECONNECT_INITIAL_DELAY;
      this.startHeartbeat();
      this.callbacks.onOpen();
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as AnyMessage;
        if (msg.type === MessageType.PONG) {
          // Heartbeat response, reset reconnect attempts on successful pong
          this.reconnectAttempts = 0;
          this.reconnectDelay = RECONNECT_INITIAL_DELAY;
          return;
        }
        this.callbacks.onMessage(msg);
      } catch (e) {
        // Silently ignore parse errors during reconnect
        if (this.reconnectAttempts === 0) {
          console.error('Failed to parse message:', e);
        }
      }
    });

    this.ws.on('close', () => {
      this.isConnecting = false;
      this.stopHeartbeat();

      if (!this.manualClose) {
        this.scheduleReconnect();
      } else {
        this.callbacks.onClose();
      }
    });

    this.ws.on('error', () => {
      // Silent error during reconnect
      this.isConnecting = false;
    });
  }

  private scheduleReconnect() {
    if (this.manualClose) {
      this.callbacks.onClose();
      return;
    }

    // Clear existing timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay,
      RECONNECT_MAX_DELAY
    );

    this.callbacks.onReconnecting?.(this.reconnectAttempts, delay);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectDelay = Math.floor(
        this.reconnectDelay * RECONNECT_BACKOFF_MULTIPLIER
      );
      this.connectWebSocket();
    }, delay);
  }

  send(msg: AnyMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  close() {
    this.manualClose = true;
    this.stopHeartbeat();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.ws?.close();
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      this.send({ type: MessageType.PING });
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}