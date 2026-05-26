# PocketMine-MP Dashboard

Web-based control panel for PocketMine-MP Minecraft Bedrock servers.

## Features

- Real-time server console
- Start/Stop/Restart server
- Player management (kick, ban, op, gamemode)
- Plugin browser
- File manager
- Server configuration editor
- Dark/Light mode

## Requirements

- Node.js 18+ or Bun
- PocketMine-MP 5.x

## Installation

```bash
# Clone
git clone https://github.com/your-username/pmmp-dashboard.git
cd pmmp-dashboard

# Install dependencies
bun install

# Download PocketMine-MP
# Linux/macOS:
curl -L -o installer.php https://get.pmmp.io
php installer.php

# Windows: download from https://pmmp.io/download
# Extract PocketMine-MP.phar to project root
# Extract bin/ folder to project root
```

## Usage

```bash
# Start dashboard
bun run dev

# In another terminal, start websocket service
cd mini-services/pmmp-console-service && bun run dev
```

Open http://localhost:3000

## Configuration

Edit `server.properties` for Minecraft server settings.

Copy `.env.example` to `.env` and modify as needed.

## Ports

| Port | Usage |
|------|-------|
| 3000 | Web dashboard |
| 3003 | WebSocket |
| 19132 | Minecraft (UDP) |

## Project Structure

```
├── src/app/          # Next.js pages
├── src/components/   # UI components
├── mini-services/    # WebSocket backend
├── bin/              # PHP binary
├── worlds/           # World saves
├── plugins/          # PMMP plugins
└── server.properties # Server config
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT
