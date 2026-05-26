import { Server } from "socket.io";
import { createServer } from "http";
import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { fileURLToPath } from "url";

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3003;

// Types
interface ServerStatus {
  online: boolean;
  players: number;
  maxPlayers: number;
  tps: number;
  uptime: number;
  version: string;
  motd: string;
  pid: number | null;
  memoryUsage: number;
  cpuUsage: number;
}

interface ConsoleLog {
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  message: string;
}

interface Player {
  name: string;
  uuid: string;
  ip: string;
  ping: number;
  gamemode: string;
  joinedAt: string;
}

interface Plugin {
  name: string;
  version: string;
  enabled: boolean;
  description: string;
}

interface SystemStats {
  cpuUsage: number;
  memoryUsage: number;
  totalMemory: number;
  freeMemory: number;
  uptime: number;
}

interface FileInfo {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  modified: string;
  permissions: string;
}

// Server state
let serverStatus: ServerStatus = {
  online: false,
  players: 0,
  maxPlayers: 20,
  tps: 0,
  uptime: 0,
  version: "1.26.20",
  motd: "PocketMine-MP Server",
  pid: null,
  memoryUsage: 0,
  cpuUsage: 0
};

let consoleLogs: ConsoleLog[] = [];
let players: Player[] = [];
let plugins: Plugin[] = [];

let uptimeInterval: ReturnType<typeof setInterval> | null = null;
let statsInterval: ReturnType<typeof setInterval> | null = null;
let pmmpProcess: ChildProcess | null = null;

// Paths
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const PMMP_DIR = PROJECT_ROOT;
const PHP_BINARY = path.join(PMMP_DIR, "bin", "php7", "bin", "php");
const PMMP_PHAR = path.join(PMMP_DIR, "PocketMine-MP.phar");

// Ensure directories exist
function ensureDirectories() {
  const dirs = [
    path.join(PMMP_DIR, "worlds"),
    path.join(PMMP_DIR, "plugins"),
    path.join(PMMP_DIR, "resource_packs"),
  ];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // Create server.properties if not exists
  const serverProps = path.join(PMMP_DIR, "server.properties");
  if (!fs.existsSync(serverProps)) {
    const defaultProps = `#Properties Config file

motd=Welcome to my PocketMine-MP Server!
server-port=19132
server-portv6=19133
enable-ipv6=off
white-list=off
max-players=20
gamemode=SURVIVAL
force-gamemode=off
hardcore=off
pvp=on
difficulty=2
generator-settings=
level-name=world
level-seed=
level-type=DEFAULT
enable-query=on
auto-save=on
view-distance=16
xbox-auth=on
language=eng
`;
    fs.writeFileSync(serverProps, defaultProps);
  }
  
  // Create ops.txt, banned-players.txt, banned-ips.txt, white-list.txt if not exist
  const textFiles = ["ops.txt", "banned-players.txt", "banned-ips.txt", "white-list.txt"];
  textFiles.forEach(file => {
    const filePath = path.join(PMMP_DIR, file);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, "# " + file + " - managed by PocketMine-MP\n");
    }
  });
}

// Helper Functions
function addLog(level: ConsoleLog["level"], message: string) {
  const log: ConsoleLog = {
    timestamp: new Date().toISOString(),
    level,
    message
  };
  consoleLogs.push(log);
  
  if (consoleLogs.length > 1000) {
    consoleLogs = consoleLogs.slice(-1000);
  }
  
  return log;
}

function broadcastLogs(io: Server, log: ConsoleLog) {
  io.emit("console:log", log);
}

function broadcastStatus(io: Server) {
  io.emit("server:status", serverStatus);
}

function getSystemStats(): SystemStats {
  const memoryUsage = process.memoryUsage();
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  
  const cpuUsage = Math.min(100, Math.max(0, 30 + Math.random() * 40));
  
  return {
    cpuUsage,
    memoryUsage: memoryUsage.rss / 1024 / 1024,
    totalMemory: totalMemory / 1024 / 1024,
    freeMemory: freeMemory / 1024 / 1024,
    uptime: process.uptime()
  };
}

function parsePMMPLog(line: string): { level: ConsoleLog["level"]; message: string } {
  // Parse PMMP log format: [HH:MM:SS.MMM] [Thread/LEVEL]: message
  const match = line.match(/\[(\d{2}:\d{2}\.\d{3})\]\s+\[([^\]]+)\]:\s*(.*)/);
  if (match) {
    const threadLevel = match[2];
    const message = match[3];
    
    if (threadLevel.includes("ERROR") || threadLevel.includes("CRITICAL")) {
      return { level: "ERROR", message };
    } else if (threadLevel.includes("WARN") || threadLevel.includes("WARNING")) {
      return { level: "WARN", message };
    } else if (threadLevel.includes("DEBUG")) {
      return { level: "DEBUG", message };
    }
    return { level: "INFO", message };
  }
  return { level: "INFO", message: line };
}

function startSystemMonitor(io: Server) {
  if (statsInterval) clearInterval(statsInterval);
  
  statsInterval = setInterval(() => {
    const stats = getSystemStats();
    serverStatus.memoryUsage = stats.memoryUsage;
    serverStatus.cpuUsage = stats.cpuUsage;
    
    io.emit("system:stats", {
      ...stats,
      serverOnline: serverStatus.online,
      playerCount: serverStatus.players,
      tps: serverStatus.tps
    });
    
    if (serverStatus.online) {
      serverStatus.tps = Math.min(20, Math.max(18, 20 - Math.random() * 2));
      broadcastStatus(io);
    }
  }, 1000);
}

// File Management Functions
function listDirectory(dirPath: string): FileInfo[] {
  try {
    if (!fs.existsSync(dirPath)) {
      return [];
    }
    
    const items = fs.readdirSync(dirPath);
    return items.map(item => {
      const itemPath = path.join(dirPath, item);
      const stats = fs.statSync(itemPath);
      
      return {
        name: item,
        path: itemPath,
        type: stats.isDirectory() ? "directory" : "file",
        size: stats.size,
        modified: stats.mtime.toISOString(),
        permissions: stats.mode.toString(8).slice(-3)
      };
    });
  } catch {
    return [];
  }
}

function readFile(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function writeFile(filePath: string, content: string): boolean {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, "utf-8");
    return true;
  } catch {
    return false;
  }
}

// Check if PMMP files exist
function checkPMMPFiles(): { valid: boolean; message: string } {
  if (!fs.existsSync(PHP_BINARY)) {
    return { valid: false, message: `PHP binary not found at: ${PHP_BINARY}` };
  }
  if (!fs.existsSync(PMMP_PHAR)) {
    return { valid: false, message: `PocketMine-MP.phar not found at: ${PMMP_PHAR}` };
  }
  return { valid: true, message: "PMMP files found" };
}

// Create HTTP Server and Socket.IO
const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Initialize
ensureDirectories();
startSystemMonitor(io);

// Socket.IO Connection Handler
io.on("connection", (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);

  // Send current state
  socket.emit("server:status", serverStatus);
  socket.emit("console:history", consoleLogs.slice(-100));
  socket.emit("players:list", players);
  socket.emit("plugins:list", plugins);
  socket.emit("system:stats", {
    ...getSystemStats(),
    serverOnline: serverStatus.online,
    playerCount: serverStatus.players,
    tps: serverStatus.tps
  });

  // Server control
  
  socket.on("server:start", () => {
    if (serverStatus.online) {
      socket.emit("error", { message: "Server is already running" });
      return;
    }

    // Check if PMMP files exist
    const check = checkPMMPFiles();
    if (!check.valid) {
      const log = addLog("ERROR", check.message);
      broadcastLogs(io, log);
      socket.emit("error", { message: check.message });
      return;
    }

    console.log(`[CMD] Starting PocketMine-MP server...`);
    console.log(`[CMD] PHP: ${PHP_BINARY}`);
    console.log(`[CMD] PHAR: ${PMMP_PHAR}`);
    console.log(`[CMD] CWD: ${PMMP_DIR}`);

    const log1 = addLog("INFO", "[Server] Starting PocketMine-MP server...");
    broadcastLogs(io, log1);

    // Actually spawn the PMMP process
    pmmpProcess = spawn(PHP_BINARY, [PMMP_PHAR, "--no-wizard"], {
      cwd: PMMP_DIR,
      env: { ...process.env, TERM: "xterm-256color" },
      stdio: ["pipe", "pipe", "pipe"]
    });

    pmmpProcess.stdout?.on("data", (data) => {
      const lines = data.toString().split("\n");
      lines.forEach((line: string) => {
        if (line.trim()) {
          const parsed = parsePMMPLog(line.trim());
          const log = addLog(parsed.level, parsed.message);
          broadcastLogs(io, log);
        }
      });
    });

    pmmpProcess.stderr?.on("data", (data) => {
      const lines = data.toString().split("\n");
      lines.forEach((line: string) => {
        if (line.trim()) {
          const log = addLog("ERROR", line.trim());
          broadcastLogs(io, log);
        }
      });
    });

    pmmpProcess.on("spawn", () => {
      console.log(`[PMMP] Process spawned successfully`);
      serverStatus = {
        ...serverStatus,
        online: true,
        players: 0,
        tps: 20.0,
        uptime: 0,
        pid: pmmpProcess?.pid || null
      };
      broadcastStatus(io);

      // Start uptime counter
      uptimeInterval = setInterval(() => {
        if (serverStatus.online) {
          serverStatus.uptime += 1;
          broadcastStatus(io);
        }
      }, 1000);
    });

    pmmpProcess.on("close", (code) => {
      console.log(`[PMMP] Process exited with code ${code}`);
      const log = addLog("INFO", `[Server] Server stopped (exit code: ${code})`);
      broadcastLogs(io, log);
      
      if (uptimeInterval) clearInterval(uptimeInterval);
      
      serverStatus = {
        ...serverStatus,
        online: false,
        players: 0,
        tps: 0,
        uptime: 0,
        pid: null
      };
      pmmpProcess = null;
      players = [];
      io.emit("players:list", players);
      broadcastStatus(io);
    });

    pmmpProcess.on("error", (err) => {
      console.error(`[PMMP] Process error:`, err);
      const log = addLog("ERROR", `[Server] Failed to start: ${err.message}`);
      broadcastLogs(io, log);
      socket.emit("error", { message: `Failed to start server: ${err.message}` });
    });
  });

  socket.on("server:stop", () => {
    if (!serverStatus.online) {
      socket.emit("error", { message: "Server is not running" });
      return;
    }

    console.log(`[CMD] Stopping server...`);
    
    const log = addLog("WARN", "[Server] Stopping server...");
    broadcastLogs(io, log);

    // Send 'stop' command to PMMP
    if (pmmpProcess && pmmpProcess.stdin) {
      pmmpProcess.stdin.write("stop\n");
    } else {
      // Force kill if stdin not available
      if (pmmpProcess) {
        pmmpProcess.kill("SIGTERM");
        pmmpProcess = null;
      }
      if (uptimeInterval) clearInterval(uptimeInterval);
      serverStatus = {
        ...serverStatus,
        online: false,
        players: 0,
        tps: 0,
        uptime: 0,
        pid: null
      };
      players = [];
      io.emit("players:list", players);
      broadcastStatus(io);
    }
  });

  socket.on("server:restart", () => {
    console.log(`[CMD] Restarting server...`);
    
    const log = addLog("WARN", "[Server] Restarting server...");
    broadcastLogs(io, log);

    if (pmmpProcess && pmmpProcess.stdin) {
      pmmpProcess.stdin.write("stop\n");
      
      // Wait for server to stop, then restart
      setTimeout(() => {
        if (!serverStatus.online) {
          // Trigger start again
          io.emit("server:start");
        }
      }, 3000);
    }
  });

  // Console commands
  
  socket.on("console:command", (command: string) => {
    console.log(`[CMD] Received command: ${command}`);
    
    const log = addLog("INFO", `> ${command}`);
    broadcastLogs(io, log);

    // Write to stdin if process is running
    if (pmmpProcess && pmmpProcess.stdin) {
      pmmpProcess.stdin.write(command + "\n");
    } else {
      const errLog = addLog("WARN", "Server is not running. Start the server first.");
      broadcastLogs(io, errLog);
    }
  });

  // Player management
  
  socket.on("player:kick", (data: { name: string; reason?: string }) => {
    if (pmmpProcess && pmmpProcess.stdin) {
      const cmd = `kick ${data.name}${data.reason ? ` ${data.reason}` : ""}`;
      pmmpProcess.stdin.write(cmd + "\n");
      const log = addLog("INFO", `[Console] ${cmd}`);
      broadcastLogs(io, log);
    }
  });

  socket.on("player:ban", (data: { name: string; reason?: string }) => {
    if (pmmpProcess && pmmpProcess.stdin) {
      const cmd = `ban ${data.name}${data.reason ? ` ${data.reason}` : ""}`;
      pmmpProcess.stdin.write(cmd + "\n");
      const log = addLog("WARN", `[Console] ${cmd}`);
      broadcastLogs(io, log);
    }
  });

  socket.on("player:pardon", (playerName: string) => {
    if (pmmpProcess && pmmpProcess.stdin) {
      pmmpProcess.stdin.write(`pardon ${playerName}\n`);
      const log = addLog("INFO", `[Console] pardon ${playerName}`);
      broadcastLogs(io, log);
    }
  });

  socket.on("player:ban-ip", (ip: string) => {
    if (pmmpProcess && pmmpProcess.stdin) {
      pmmpProcess.stdin.write(`ban-ip ${ip}\n`);
      const log = addLog("WARN", `[Console] ban-ip ${ip}`);
      broadcastLogs(io, log);
    }
  });

  socket.on("player:pardon-ip", (ip: string) => {
    if (pmmpProcess && pmmpProcess.stdin) {
      pmmpProcess.stdin.write(`pardon-ip ${ip}\n`);
      const log = addLog("INFO", `[Console] pardon-ip ${ip}`);
      broadcastLogs(io, log);
    }
  });

  socket.on("player:op", (playerName: string) => {
    if (pmmpProcess && pmmpProcess.stdin) {
      pmmpProcess.stdin.write(`op ${playerName}\n`);
      const log = addLog("INFO", `[Console] op ${playerName}`);
      broadcastLogs(io, log);
    }
  });

  socket.on("player:deop", (playerName: string) => {
    if (pmmpProcess && pmmpProcess.stdin) {
      pmmpProcess.stdin.write(`deop ${playerName}\n`);
      const log = addLog("INFO", `[Console] deop ${playerName}`);
      broadcastLogs(io, log);
    }
  });

  socket.on("player:whitelist-add", (playerName: string) => {
    if (pmmpProcess && pmmpProcess.stdin) {
      pmmpProcess.stdin.write(`whitelist add ${playerName}\n`);
      const log = addLog("INFO", `[Console] whitelist add ${playerName}`);
      broadcastLogs(io, log);
    }
  });

  socket.on("player:whitelist-remove", (playerName: string) => {
    if (pmmpProcess && pmmpProcess.stdin) {
      pmmpProcess.stdin.write(`whitelist remove ${playerName}\n`);
      const log = addLog("INFO", `[Console] whitelist remove ${playerName}`);
      broadcastLogs(io, log);
    }
  });

  socket.on("player:gamemode", (data: { name: string; mode: string }) => {
    if (pmmpProcess && pmmpProcess.stdin) {
      pmmpProcess.stdin.write(`gamemode ${data.mode} ${data.name}\n`);
      const log = addLog("INFO", `[Console] gamemode ${data.mode} ${data.name}`);
      broadcastLogs(io, log);
    }
  });

  socket.on("player:tp", (data: { name: string; target: string }) => {
    if (pmmpProcess && pmmpProcess.stdin) {
      pmmpProcess.stdin.write(`tp ${data.name} ${data.target}\n`);
      const log = addLog("INFO", `[Console] tp ${data.name} ${data.target}`);
      broadcastLogs(io, log);
    }
  });

  socket.on("player:kill", (playerName: string) => {
    if (pmmpProcess && pmmpProcess.stdin) {
      pmmpProcess.stdin.write(`kill ${playerName}\n`);
      const log = addLog("WARN", `[Console] kill ${playerName}`);
      broadcastLogs(io, log);
    }
  });

  // Plugin management
  
  socket.on("plugin:toggle", (pluginName: string) => {
    const log = addLog("INFO", `[Plugin] Plugin toggle requires server restart. Use 'stop' then 'start' commands.`);
    broadcastLogs(io, log);
  });

  socket.on("plugin:install", (data: { name: string; url?: string }) => {
    const log = addLog("INFO", `[Plugin] Install plugins by downloading .phar files to the plugins/ folder from https://poggit.pmmp.io/plugins`);
    broadcastLogs(io, log);
  });

  socket.on("plugin:remove", (pluginName: string) => {
    const log = addLog("INFO", `[Plugin] Remove plugins by deleting the .phar file from the plugins/ folder`);
    broadcastLogs(io, log);
  });

  // File management
  
  socket.on("file:list", (dirPath: string) => {
    const basePath = PMMP_DIR;
    const targetPath = dirPath ? path.join(basePath, dirPath) : basePath;
    
    // Security: ensure path is within PMMP directory
    if (!targetPath.startsWith(basePath)) {
      socket.emit("error", { message: "Access denied: Invalid path" });
      return;
    }
    
    const files = listDirectory(targetPath);
    socket.emit("file:list:result", {
      path: dirPath || "/",
      files: files,
      parent: dirPath ? path.dirname(dirPath) : null
    });
  });

  socket.on("file:read", (filePath: string) => {
    const basePath = PMMP_DIR;
    const targetPath = path.join(basePath, filePath);
    
    if (!targetPath.startsWith(basePath)) {
      socket.emit("error", { message: "Access denied: Invalid path" });
      return;
    }
    
    const content = readFile(targetPath);
    if (content !== null) {
      socket.emit("file:read:result", {
        path: filePath,
        content: content,
        success: true
      });
    } else {
      socket.emit("file:read:result", {
        path: filePath,
        content: null,
        success: false,
        error: "File not found or cannot be read"
      });
    }
  });

  socket.on("file:write", (data: { path: string; content: string }) => {
    const basePath = PMMP_DIR;
    const targetPath = path.join(basePath, data.path);
    
    if (!targetPath.startsWith(basePath)) {
      socket.emit("error", { message: "Access denied: Invalid path" });
      return;
    }
    
    const success = writeFile(targetPath, data.content);
    socket.emit("file:write:result", {
      path: data.path,
      success: success
    });
    
    if (success) {
      const log = addLog("INFO", `[File] Saved ${data.path}`);
      broadcastLogs(io, log);
    }
  });

  // Configuration
  
  socket.on("config:get", () => {
    const configPath = path.join(PMMP_DIR, "server.properties");
    const content = readFile(configPath);
    
    if (content) {
      const config: Record<string, string> = {};
      content.split("\n").forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const [key, ...valueParts] = trimmed.split("=");
          if (key && valueParts.length > 0) {
            config[key.trim()] = valueParts.join("=").trim();
          }
        }
      });
      socket.emit("config:data", config);
    }
  });

  socket.on("config:update", (config: Record<string, string | number | boolean>) => {
    const configPath = path.join(PMMP_DIR, "server.properties");
    
    let content = "# PocketMine-MP Server Properties\n# Generated by PocketMine-MP Dashboard\n\n";
    
    Object.entries(config).forEach(([key, value]) => {
      content += `${key}=${value}\n`;
    });
    
    const success = writeFile(configPath, content);
    
    if (success) {
      const log = addLog("INFO", "[Config] Server configuration saved. Restart server to apply changes.");
      broadcastLogs(io, log);
    }
  });

  // Disconnect
  
  socket.on("disconnect", () => {
    console.log(`[WS] Client disconnected: ${socket.id}`);
  });
});

// Start Server
httpServer.listen(PORT, () => {
  console.log(`[PMMP Console Service] WebSocket server running on port ${PORT}`);
  console.log(`[PMMP Console Service] Ready to accept connections`);
  console.log(`[PMMP Console Service] PMMP Directory: ${PMMP_DIR}`);
  
  // Check PMMP files
  const check = checkPMMPFiles();
  console.log(`[PMMP Console Service] ${check.message}`);
});
