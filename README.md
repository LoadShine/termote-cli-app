# Termote

Termote is a powerful remote terminal mapping tool that allows you to securely access and control your local terminal from anywhere via a web browser.

## ✨ Features

- 🌐 **Web Access**: Generate a unique URL to seamlessly access your terminal through a browser.
- 📱 **Mobile Friendly**: Automatically generates QR codes for quick access via mobile phones or tablets.
- 🔒 **Secure Authentication**: Complete user login and authentication flow to ensure session security.
- ⚡ **Real-time Sync**: Low-latency bidirectional terminal synchronization based on WebSocket and node-pty.
- 📝 **Session Management**: Easily view, manage, and stop active shared sessions.
- 🔄 **Reconnection**: Supports reconnecting to sessions after disconnection.

## 📦 Installation

Ensure your system has Node.js (>= 18.0.0) installed.

```bash
# Clone the repository
git clone https://github.com/LoadShine/termote-cli-app.git

# Enter the directory
cd termote-cli-app

# Install dependencies
pnpm install

# Build the project
pnpm build

# Link globally (optional, for direct use of termote command)
npm link
```

## 🚀 Usage

### 1. Login
First, you need to log in to the Termote service:

```bash
termote login
```
*Optional arguments:*
- `--server-url <url>`: Specify a custom server URL (default: https://termote.agi.build)
- `--dev`: Use local development server (default: http://localhost:3000)

### 2. Start Sharing
Start a new terminal sharing session:

```bash
termote start
```
After execution, the terminal will display an access link and a QR code. You can open the link directly in your browser to operate your terminal.

You can also specify a specific command to run in the shared terminal:
```bash
termote start -- npm run dev
```

### 3. List Sessions
List all currently active sessions:

```bash
termote list
```
*Optional arguments:*
- `-a, --all`: Show all sessions including inactive ones

### 4. Stop Session
Stop a specific session:

```bash
termote stop --sessionId <session-id>
```
Or stop all active sessions:

```bash
termote stop --all
```

### 5. Logout
Log out of the current account:

```bash
termote logout
```

## 🛠️ Development

This project is developed using TypeScript.

```bash
# Development mode (watch for file changes and rebuild)
pnpm dev

# Build for production
pnpm build

# Run type check
pnpm typecheck
```

## 📄 License

MIT
