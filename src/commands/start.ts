import config from "@/config/store";
import { PtyManager } from "@/pty/manager";
import { MessageType } from "@/shared";
import { createTerminalSession, fetchTerminalSession, WsClient, FatalError } from "@/lib/platform";
import { printError, isVerbose } from "@/lib/errors";
import QRCode from "qrcode";

const TERMOTE_SESSION_ID_VAR = "TERMOTE_SESSION_ID";

// Terminal output buffer to send to newly connected clients
const MAX_BUFFER_SIZE = 256000; // 256KB max buffer
class TerminalBuffer {
  private buffer: string[] = [];
  private size = 0;

  write(data: string) {
    this.buffer.push(data);
    this.size += data.length;

    // Trim buffer if too large
    while (this.size > MAX_BUFFER_SIZE && this.buffer.length > 0) {
      const removed = this.buffer.shift()!;
      this.size -= removed.length;
    }
  }

  getSnapshot(): string {
    return this.buffer.join("");
  }

  clear() {
    this.buffer = [];
    this.size = 0;
  }
}

function formatDuration(timestamp: string | number): string {
  const now = Date.now();
  const ts = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
  const diff = now - ts;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return `${seconds}s`;
  }
}

function formatId(id: string): string {
  return id.slice(0, 8);
}

async function startSession({
  sessionId,
  token,
  serverUrl,
  commandArgs,
  shell,
  isReconnect = false,
}: {
  sessionId: string;
  token: string;
  serverUrl: string;
  commandArgs: string[];
  shell: string;
  isReconnect?: boolean;
}) {
  const wsUrl = `/api/terminal/ws?sessionId=${sessionId}`;
  const fullWsUrl = new URL(wsUrl, serverUrl).toString();
  const sessionUrl = `${serverUrl}/t/${sessionId}`;

  if (isReconnect) {
    console.log(`\x1b[33mReconnecting to session:\x1b[0m`);
  } else {
    // Display session info with QR code and details side by side
    const qr = await QRCode.toString(sessionUrl, {
      type: "utf8",
      errorCorrectionLevel: "Q",
      margin: 2,
    });

    const qrLines = qr.split("\n");
    const maxLines = qrLines.length;

    const infoText = [
      `\x1b[32m✔ Session created!\x1b[0m`,
      ``,
      `\x1b[36mURL:\x1b[0m ${sessionUrl}`,
      `\x1b[36mID:\x1b[0m ${sessionId}`,
      ``,
      `\x1b[33mUsage:\x1b[0m`,
      `  Stop session:`,
      `  \x1b[90mtermote stop --sessionId ${sessionId}\x1b[0m`,
      `  Or: \x1b[90mtermote stop --all\x1b[0m`,
      ``,
      `  Scan QR code to connect from mobile`,
    ];

    // Print side by side
    for (let i = 0; i < Math.max(maxLines, infoText.length); i++) {
      let line = "";

      // Left column: QR code
      if (i < maxLines) {
        line += qrLines[i] || "";
      }

      // Separator
      line += "   "; // Spacing between columns

      // Right column: Info text
      if (i < infoText.length) {
        line += infoText[i] || "";
      }

      console.log(line);
    }

    console.log(""); // Extra newline after the box
  }

  // Set environment variable for child processes
  process.env[TERMOTE_SESSION_ID_VAR] = sessionId;

  // Initialize terminal buffer
  const terminalBuffer = new TerminalBuffer();

  // Initialize PTY
  const pty = new PtyManager();

  // Determine what to run
  if (commandArgs.length > 0) {
    // User specified a command - run shell in interactive mode
    // Then send the command as input after shell starts
    pty.spawn(shell, []);

    // Wait a bit for shell to be ready, then send the command
    setTimeout(() => {
      const command = commandArgs.join(" ");
      pty.write(command + "\n");
    }, 300);
  } else {
    // No command specified, just run the shell
    pty.spawn(shell, []);
  }

  // Connect WebSocket with auto-reconnect
  const ws = new WsClient(fullWsUrl, token);

  let reconnectShown = false;

  ws.connect({
    onMessage: (msg) => {
      // Clear reconnect notice on successful message
      if (reconnectShown) {
        process.stdout.write("\x1b[1A\x1b[K"); // Move up and clear line
        reconnectShown = false;
      }

      switch (msg.type) {
        case MessageType.TERMINAL_INPUT:
          pty.write(msg.data);
          break;
        case MessageType.TERMINAL_RESIZE:
          if (!process.stdout.isTTY) {
            pty.resize(msg.cols, msg.rows);
          }
          break;
        case MessageType.SESSION_READY:
          // Client connected - send terminal size and buffered output
          const { columns, rows } = process.stdout.isTTY
            ? { columns: process.stdout.columns, rows: process.stdout.rows }
            : { columns: 80, rows: 24 };

          // First send the buffered output
          const snapshot = terminalBuffer.getSnapshot();
          if (snapshot) {
            ws.send({
              type: MessageType.TERMINAL_OUTPUT,
              data: snapshot,
            });
          }

          // Then send the terminal size
          ws.send({
            type: MessageType.TERMINAL_RESIZE,
            cols: columns,
            rows: rows,
          });
          break;
        case MessageType.SESSION_END:
          // Session stopped by user, exit gracefully
          console.log(
            `\n\x1b[33mSession ended: ${msg.reason || "Unknown reason"}\x1b[0m`,
          );
          ws.close();
          pty.onExit(() => process.exit(0));
          // Give PTY a moment to clean up, then exit
          setTimeout(() => process.exit(0), 100);
          // Set a flag so onClose knows we're exiting due to session end
          (ws as any).isSessionEnd = true;
          break;
      }
    },
    onOpen: () => {
      // On open
      if (process.stdout.isTTY) {
        const { columns, rows } = process.stdout;
        ws.send({
          type: MessageType.TERMINAL_RESIZE,
          cols: columns,
          rows: rows,
        });
      }
    },
    onClose: () => {
      // On close - exit if not due to session end
      pty.onExit(() => {
        process.exit(0);
      });
      // Only exit if this close wasn't caused by session end
      if (!(ws as any).isSessionEnd) {
        process.exit(0);
      }
    },
    onReconnecting: (attempt, delay) => {
      console.log(
        `\x1b[33m⚠ Connection lost. Reconnecting... (attempt ${attempt}, delay ${delay}ms)\x1b[0m`,
      );
      // On reconnecting
      if (!reconnectShown) {
        reconnectShown = true;
      }
    },
    onReconnected: () => {
      // On reconnected
      if (reconnectShown) {
        process.stdout.write("\x1b[1A\x1b[K"); // Clear the reconnect line
        console.log(`\x1b[32m✔ Reconnected\x1b[0m`);
        reconnectShown = false;
      }
    },
    onFatalError: (message) => {
      console.error(`\n\x1b[31m✖ ${message}\x1b[0m\n`);
      ws.close();
      pty.onExit(() => process.exit(1));
      setTimeout(() => process.exit(1), 100);
    },
  });

  // PTY -> Local Stdout + WebSocket + Buffer
  pty.onData((data) => {
    // Buffer the output for new clients
    terminalBuffer.write(data);

    ws.send({
      type: MessageType.TERMINAL_OUTPUT,
      data,
    });
    process.stdout.write(data);
  });

  // Local Stdin -> PTY
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();

    process.stdin.on("data", (key) => {
      pty.write(key.toString("utf8"));
    });
  }

  // Local Resize -> PTY + WebSocket
  if (process.stdout.isTTY) {
    process.stdout.on("resize", () => {
      const { columns, rows } = process.stdout;
      pty.resize(columns, rows);
      if (ws.isConnected()) {
        ws.send({
          type: MessageType.TERMINAL_RESIZE,
          cols: columns,
          rows: rows,
        });
      }
    });
  }

  // Cleanup on exit
  pty.onExit(() => {
    console.log("\nProcess exited.");
    ws.close();
    process.exit(0);
  });

  // Handle graceful shutdown
  const cleanup = () => {
    ws.close();
    pty.onExit(() => process.exit(0));
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

export async function start(
  options: { force?: boolean, name?: string },
  commandArgs: string[] = [],
) {
  const serverUrl = config.get("serverUrl") as string;
  // Support both legacy deviceToken and new accessToken
  const deviceToken = config.get("accessToken") as string || config.get("deviceToken") as string;

  if (!deviceToken) {
    console.error('Not logged in. Please run "termote login" first.');
    process.exit(1);
  }

  try {
    let shell = process.env.SHELL;
    if (!shell) {
      // Default to platform-specific shell if not set
      switch (process.platform) {
        case "win32":
          shell = "powershell.exe";
          break;
        case "darwin":
          shell = "/bin/zsh";
          break;
        case "linux":
          shell = "/bin/bash";
          break;
        default:
          shell = "/bin/bash";
      }
    }

    // Check if current terminal already has a session via env var
    if (!options.force) {
      const existingSessionId = process.env[TERMOTE_SESSION_ID_VAR];

      if (existingSessionId) {
        // Check if the existing session is still active
        const session = await fetchTerminalSession(
          serverUrl,
          deviceToken,
          existingSessionId,
        );

        if (session && session.agent.connected) {
          console.log(
            `\x1b[33mThis terminal already has an active session:\x1b[0m`,
          );
          console.log(`  ID: ${formatId(existingSessionId)}`);
          console.log(
            `  Status: active (last updated ${formatDuration(session.updatedAt || session.createdAt)} ago)\n`,
          );
          console.log(
            `Open a new terminal window or run \x1b[36mtermote start --force\x1b[0m to create a new session.`,
          );
          process.exit(0);
        }

        // Session exists but is inactive, reconnect to it
        if (session && !session.agent.connected) {
          console.log(
            `\x1b[33mFound inactive session ${formatId(existingSessionId)}. Reconnecting...\x1b[0m`,
          );
          return startSession({
            sessionId: existingSessionId,
            token: deviceToken,
            serverUrl,
            commandArgs,
            shell,
            isReconnect: true,
          });
        }

        // Session not found on server, create new one
        console.log(
          `\x1b[33mPrevious session not found. Creating a new one...\x1b[0m`,
        );
      }
    }

    // Create new session
    console.log("Creating new session...");
    const { sessionId } = await createTerminalSession({
      serverUrl,
      deviceToken,
      name: options.name,
      shell,
      version: process.env.VERSION || '0.0.0',
      platform: process.platform,
    });
    await startSession({ sessionId, token: deviceToken, serverUrl, commandArgs, shell });
  } catch (error: any) {
    if (error instanceof FatalError) {
      console.error(`\n\x1b[31m✖ ${error.message}\x1b[0m\n`);
    } else if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
      console.error(`\n\x1b[31m✖ Failed to connect to server: ${serverUrl}\x1b[0m`);
      console.error(`\n  Possible reasons:`);
      console.error(`  • Server is down or unreachable`);
      console.error(`  • Network connection issues`);
      console.error(`  • Firewall blocking the connection`);
      console.error(`\n  Try: Check your internet connection and server URL.\n`);
    } else if (error.message.includes('API endpoint not found')) {
      console.error(`\n\x1b[31m✖ ${error.message}\x1b[0m`);
      console.error(`\n  Server URL: ${serverUrl}`);
      console.error(`\n  Tips:`);
      console.error(`  • Make sure the Termote server is running`);
      console.error(`  • Check if the server URL is correct`);
      console.error(`  • Run "termote login" to reconfigure the server\n`);
    } else {
      printError(error, isVerbose());
    }
    process.exit(1);
  }
}
