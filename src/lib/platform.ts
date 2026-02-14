
import WebSocket from 'ws';
import {
  MessageType,
  type AnyMessage,
  HEARTBEAT_INTERVAL
} from '@/shared';

export interface TerminalSession {
  id: string;
  name?: string;
  agent: {
    connected: boolean,
    shell?: string,
    version?: string,
    platform?: string,
    ip?: string,
    country?: string,
    region?: string,
    city?: string
  },
  clients: number;
  connectable: boolean;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export const DEAULTE_SERVER_URL = 'https://termote.agi.build';

export class FatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FatalError';
  }
}

export async function fetchTerminalSession(
  serverUrl: string,
  deviceToken: string,
  sessionId: string,
) {
  const url = `${serverUrl}/api/terminal/sessions/${sessionId}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${deviceToken}`,
      },
    });

    if (res.status === 400) {
      throw new FatalError(`Invalid request parameters. Please check your session ID.`);
    }
    if (res.status === 401) {
      throw new FatalError('Authentication failed. Please run "termote login" again.');
    }
    if (res.status === 404) {
      throw new FatalError(`Session not found: ${sessionId.slice(0, 8)}\n\nThe session may have been deleted or expired.`);
    }
    if (res.status >= 500) {
      throw new FatalError('Server error. Please try again later.');
    }

    if (!res.ok) {
      return null;
    }

    return (await res.json()) as TerminalSession;
  } catch (error) {
    if (error instanceof FatalError) {
      throw error;
    }
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
  name,
  shell,
  version,
  platform,
}: {
  serverUrl: string;
  deviceToken: string;
  name?: string;
  shell: string;
  version?: string;
  platform?: string;
}) {
  const url = `${serverUrl}/api/terminal/sessions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${deviceToken}`,
    },
    body: JSON.stringify({ name, shell, version, platform }),
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
  onFatalError?: (message: string) => void;
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

    // Handle HTTP error responses (non-101 status codes)
    this.ws.on('unexpected-response', (_req, res) => {
      this.isConnecting = false;
      this.stopHeartbeat();

      let errorMessage: string;
      switch (res.statusCode) {
        case 400:
          errorMessage = 'Invalid request parameters. Please check your session configuration.';
          break;
        case 401:
          errorMessage = 'Authentication failed. Please run "termote login" again.';
          break;
        case 404:
          errorMessage = 'Session not found. The session may have been deleted or expired.';
          break;
        case 500:
        case 502:
        case 503:
          errorMessage = 'Server error. Please try again later.';
          break;
        default:
          errorMessage = `Connection failed (HTTP ${res.statusCode}). Please try again.`;
      }

      this.manualClose = true;
      this.callbacks.onFatalError?.(errorMessage);
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