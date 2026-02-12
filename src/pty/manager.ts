import os from 'os';
import { createRequire } from 'module';
import { spawn as spawnChild, type ChildProcessWithoutNullStreams } from 'child_process';

const require = createRequire(import.meta.url);

// Fallback PTY interface when node-pty fails
class FallbackPty {
  private process: ChildProcessWithoutNullStreams;

  constructor(shell: string, args: string[] = [], options: any) {
    // Use raw child_process
    this.process = spawnChild(shell, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'] // We pipe stdin/out/err
    });
  }

  onData(fn: (data: string) => void) {
    this.process.stdout.on('data', (d) => fn(d.toString()));
    this.process.stderr.on('data', (d) => fn(d.toString()));
  }

  write(data: string) {
    this.process.stdin.write(data);
  }

  resize(_cols: number, _rows: number) {
    // Standard processes don't support resizing, ignore
  }

  kill() {
    this.process.kill();
  }

  onExit(fn: (code: number) => void) {
    this.process.on('exit', fn);
  }

  get pid() {
    return this.process.pid;
  }
}

export class PtyManager {
  private ptyProcess: any = null;

  spawn(command: string | undefined, args: string[] = []) {
    // 1. Determine command to run
    const defaultShell = process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/bash');
    const cmdToUse = command || defaultShell;

    // console.log(`\nSpawning: ${cmdToUse} ${args.join(' ')}`);

    // Sanitize environment variables
    const env: Record<string, string> = {};
    for (const key in process.env) {
      const value = process.env[key];
      if (value) env[key] = String(value);
    }

    // Attempt 1: Try node-pty (True PTY)
    try {
      const pty = require('node-pty');
      this.ptyProcess = pty.spawn(cmdToUse, args, {
        name: process.env.TERM || 'xterm-256color', // Use local TERM or modern default
        cols: process.stdout.columns || 80,
        rows: process.stdout.rows || 24,
        cwd: env['PWD'] || process.cwd(),
        env: env
      });
      return this.ptyProcess;
    } catch (e: any) {
      console.warn('\n\x1b[33mWarning: node-pty failed. Falling back to child_process.\x1b[0m');

      // Attempt 2: Fallback to child_process
      this.ptyProcess = new FallbackPty(cmdToUse, args, {
        cwd: env['PWD'] || process.cwd(),
        env: env
      });
      return this.ptyProcess;
    }
  }

  // Add exit handler
  onExit(callback: (code: number) => void) {
    if (this.ptyProcess) {
      this.ptyProcess.onExit(callback);
    }
  }


  onData(callback: (data: string) => void) {
    if (this.ptyProcess) {
      this.ptyProcess.onData(callback);
    }
  }

  write(data: string) {
    if (this.ptyProcess) {
      this.ptyProcess.write(data);
    }
  }

  resize(cols: number, rows: number) {
    if (this.ptyProcess) {
      this.ptyProcess.resize(cols, rows);
    }
  }

  kill() {
    if (this.ptyProcess) {
      this.ptyProcess.kill();
    }
  }
}
