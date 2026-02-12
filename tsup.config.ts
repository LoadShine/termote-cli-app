import { defineConfig } from 'tsup';
import pkg from './package.json';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  clean: true,
  minify: true,
  target: 'node18',
  banner: {
    js: '#!/usr/bin/env node',
  },
  sourcemap: true,
  define: {
    'process.env.VERSION': JSON.stringify(pkg.version),
  },
  external: [
    'node-pty',
    'better-auth',
    'ws',
    'conf',
    'qrcode'
  ],
});
