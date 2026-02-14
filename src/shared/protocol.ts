// WebSocket Message Types
export enum MessageType {
  // Terminal I/O
  TERMINAL_INPUT = 'TERMINAL_INPUT',
  TERMINAL_OUTPUT = 'TERMINAL_OUTPUT',
  TERMINAL_RESIZE = 'TERMINAL_RESIZE',

  // Session Lifecycle
  SESSION_READY = 'SESSION_READY',
  SESSION_END = 'SESSION_END',
  HISTORY_REQUEST = 'HISTORY_REQUEST', // Client requests terminal history buffer

  // Auth
  AUTH_TOKEN = 'AUTH_TOKEN',
  AUTH_OK = 'AUTH_OK',
  AUTH_FAIL = 'AUTH_FAIL',

  // Heartbeat
  PING = 'PING',
  PONG = 'PONG',
  KEEP_ALIVE = 'KEEP_ALIVE', // Keep alive setting from client
}

export interface BaseMessage {
  type: MessageType;
}

export interface TerminalInputMessage extends BaseMessage {
  type: MessageType.TERMINAL_INPUT;
  data: string;
}

export interface TerminalOutputMessage extends BaseMessage {
  type: MessageType.TERMINAL_OUTPUT;
  data: string;
}

export interface TerminalResizeMessage extends BaseMessage {
  type: MessageType.TERMINAL_RESIZE;
  cols: number;
  rows: number;
}

export interface SessionReadyMessage extends BaseMessage {
  type: MessageType.SESSION_READY;
}

export interface SessionEndMessage extends BaseMessage {
  type: MessageType.SESSION_END;
  reason?: string;
}

export interface HistoryRequestMessage extends BaseMessage {
  type: MessageType.HISTORY_REQUEST;
}

export interface AuthTokenMessage extends BaseMessage {
  type: MessageType.AUTH_TOKEN;
  token: string;
}

export interface AuthOkMessage extends BaseMessage {
  type: MessageType.AUTH_OK;
}

export interface AuthFailMessage extends BaseMessage {
  type: MessageType.AUTH_FAIL;
  reason: string;
}

export interface PingMessage extends BaseMessage {
  type: MessageType.PING;
}

export interface KeepAliveMessage extends BaseMessage {
  type: MessageType.KEEP_ALIVE;
  value: boolean; // Whether keep alive is enabled
}

export interface PongMessage extends BaseMessage {
  type: MessageType.PONG;
}

export type AnyMessage =
  | TerminalInputMessage
  | TerminalOutputMessage
  | TerminalResizeMessage
  | SessionReadyMessage
  | SessionEndMessage
  | HistoryRequestMessage
  | AuthTokenMessage
  | AuthOkMessage
  | AuthFailMessage
  | PingMessage
  | PongMessage;
