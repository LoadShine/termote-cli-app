# Termote

Access your terminal remotely from any browser - mobile or desktop.

## 🏗️ Project Structure

- **CLI** (current repository) - Install this to enable remote terminal access
- **Web** - The browser interface, coming soon at [termote-web-app](https://github.com/LoadShine/termote-web-app)

## 🚀 Quick Start

```bash
# Install
npm install -g termote

# Login
termote login

# Start a session
termote start
```

Open the generated link in any browser to access your terminal.

## ✨ Features

- 🌐 **Browser Access** - Access your terminal from any browser on mobile or desktop
- 📱 **QR Code** - Quick mobile access with auto-generated QR codes
- 🔒 **Secure** - User authentication to protect your sessions
- ⚡ **Real-time** - Low-latency terminal synchronization
- 🔄 **Reconnection** - Resume sessions after network interruptions

## 📦 Installation

Requires Node.js >= 18.0.0.

```bash
# npm
npm install -g termote

# pnpm
pnpm add -g termote

# yarn
yarn global add termote
```

## 📖 Commands

### `termote login`

Authenticate with Termote.

### `termote start`

Start a remote terminal session. A URL and QR code will be displayed for browser access.

```bash
# Basic usage
termote start

# With a session name
termote start -n "my session"

# Run a specific command
termote start -- htop
```

Options:
- `-n, --name <name>` - Session name
- `-f, --force` - Force create a new session

### `termote list`

View all active sessions.

```bash
termote list
```

Options:
- `-a, --all` - Include inactive sessions

### `termote stop`

Stop sessions.

```bash
# Stop a specific session
termote stop -s <session-id>

# Stop all active sessions
termote stop --all
```

### `termote logout`

Log out from Termote.

## 👤 Author

**hikerell**
- Twitter: [@hikerell](https://twitter.com/hikerell)

## 📄 License

MIT
