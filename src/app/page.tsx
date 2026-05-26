"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Play,
  Square,
  RotateCcw,
  Terminal,
  Users,
  Puzzle,
  FolderOpen,
  Settings,
  Cpu,
  HardDrive,
  Clock,
  Send,
  Server,
  Activity,
  FileText,
  ChevronRight,
  Folder,
  File,
  Trash2,
  Download,
  Edit,
  Save,
  X,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Info
} from "lucide-react";

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

interface FileInfo {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  modified: string;
  permissions: string;
}

interface SystemStats {
  cpuUsage: number;
  memoryUsage: number;
  totalMemory: number;
  freeMemory: number;
  uptime: number;
  serverOnline: boolean;
  playerCount: number;
  tps: number;
}

// Utility functions
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function getLevelColor(level: ConsoleLog["level"]): string {
  switch (level) {
    case "ERROR": return "text-red-500";
    case "WARN": return "text-yellow-500";
    case "DEBUG": return "text-gray-500";
    default: return "text-green-400";
  }
}

function getLevelIcon(level: ConsoleLog["level"]) {
  switch (level) {
    case "ERROR": return <AlertCircle className="w-4 h-4 text-red-500" />;
    case "WARN": return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    case "DEBUG": return <Info className="w-4 h-4 text-gray-500" />;
    default: return <CheckCircle2 className="w-4 h-4 text-green-400" />;
  }
}

export default function PocketMineDashboard() {
  // State
  const [connected, setConnected] = useState(false);
  const [serverStatus, setServerStatus] = useState<ServerStatus>({
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
  });
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLog[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [commandInput, setCommandInput] = useState("");
  const [activeTab, setActiveTab] = useState("console");

  // File manager state
  const [currentPath, setCurrentPath] = useState("/");
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [editingFile, setEditingFile] = useState(false);

  // Settings state
  const [serverConfig, setServerConfig] = useState<Record<string, string>>({});

  // Refs
  const socketRef = useRef<Socket | null>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);

  // Socket connection
  useEffect(() => {
    const socket = io("/?XTransformPort=3003", {
      transports: ["websocket", "polling"]
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[Socket] Connected to server");
      setConnected(true);
    });

    socket.on("disconnect", () => {
      console.log("[Socket] Disconnected from server");
      setConnected(false);
    });

    socket.on("server:status", (status: ServerStatus) => {
      setServerStatus(status);
    });

    socket.on("console:log", (log: ConsoleLog) => {
      setConsoleLogs(prev => [...prev.slice(-999), log]);
    });

    socket.on("console:history", (logs: ConsoleLog[]) => {
      setConsoleLogs(logs);
    });

    socket.on("players:list", (playerList: Player[]) => {
      setPlayers(playerList);
    });

    socket.on("plugins:list", (pluginList: Plugin[]) => {
      setPlugins(pluginList);
    });

    socket.on("system:stats", (stats: SystemStats) => {
      setSystemStats(stats);
    });

    socket.on("file:list:result", (data: { path: string; files: FileInfo[]; parent: string | null }) => {
      setFiles(data.files);
      setCurrentPath(data.path);
    });

    socket.on("file:read:result", (data: { path: string; content: string | null; success: boolean }) => {
      if (data.success && data.content) {
        setFileContent(data.content);
        setSelectedFile(data.path);
        setEditingFile(true);
      }
    });

    socket.on("file:write:result", (data: { path: string; success: boolean }) => {
      if (data.success) {
        setEditingFile(false);
        setSelectedFile(null);
      }
    });

    socket.on("config:data", (config: Record<string, string>) => {
      setServerConfig(config);
    });

    socket.on("error", (data: { message: string }) => {
      const log: ConsoleLog = {
        timestamp: new Date().toISOString(),
        level: "ERROR",
        message: data.message
      };
      setConsoleLogs(prev => [...prev, log]);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Auto-scroll console
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [consoleLogs]);

  // Load files on tab change
  useEffect(() => {
    if (activeTab === "files" && socketRef.current) {
      socketRef.current.emit("file:list", currentPath);
    }
    if (activeTab === "settings" && socketRef.current) {
      socketRef.current.emit("config:get");
    }
  }, [activeTab, currentPath]);

  // Handlers
  const handleStartServer = useCallback(() => {
    socketRef.current?.emit("server:start");
  }, []);

  const handleStopServer = useCallback(() => {
    socketRef.current?.emit("server:stop");
  }, []);

  const handleRestartServer = useCallback(() => {
    socketRef.current?.emit("server:restart");
  }, []);

  const handleSendCommand = useCallback(() => {
    if (commandInput.trim()) {
      socketRef.current?.emit("console:command", commandInput.trim());
      setCommandInput("");
      commandInputRef.current?.focus();
    }
  }, [commandInput]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSendCommand();
    }
  }, [handleSendCommand]);

  const handleFileClick = useCallback((file: FileInfo) => {
    if (file.type === "directory") {
      socketRef.current?.emit("file:list", file.path.replace(serverStatus.motd, ""));
    } else {
      socketRef.current?.emit("file:read", file.path.replace(serverStatus.motd, ""));
    }
  }, [serverStatus.motd]);

  const handleSaveFile = useCallback(() => {
    if (selectedFile) {
      socketRef.current?.emit("file:write", {
        path: selectedFile,
        content: fileContent
      });
    }
  }, [selectedFile, fileContent]);

  const handleUpdateConfig = useCallback(() => {
    socketRef.current?.emit("config:update", serverConfig);
  }, [serverConfig]);

  // Quick commands
  // Official PMMP commands - Reference: https://github.com/pmmp/PocketMine-MP/blob/stable/src/permission/DefaultPermissionNames.php
  const quickCommands = [
    // Server info
    { label: "help", cmd: "help" },
    { label: "list", cmd: "list" },
    { label: "status", cmd: "status" },
    { label: "version", cmd: "version" },
    { label: "plugins", cmd: "plugins" },
    // Server management
    { label: "gc", cmd: "gc" },
    { label: "save-all", cmd: "save-all" },
    { label: "stop", cmd: "stop" },
    // Player management
    { label: "whitelist on", cmd: "whitelist on" },
    { label: "whitelist off", cmd: "whitelist off" },
    { label: "whitelist list", cmd: "whitelist list" },
    // Gameplay
    { label: "time set day", cmd: "time set day" },
    { label: "time set night", cmd: "time set night" },
    { label: "difficulty easy", cmd: "difficulty easy" },
    { label: "difficulty normal", cmd: "difficulty normal" },
    { label: "difficulty hard", cmd: "difficulty hard" },
    // Broadcast
    { label: "say Hi!", cmd: "say Hello everyone!" },
    // Performance
    { label: "timings on", cmd: "timings on" },
    { label: "timings off", cmd: "timings off" },
    { label: "timings paste", cmd: "timings paste" }
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Server className="w-8 h-8 text-primary" />
              <div>
                <h1 className="text-xl font-bold">PocketMine-MP Dashboard</h1>
                <p className="text-sm text-muted-foreground">
                  Minecraft Bedrock Server Control Panel
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
                <span className="text-sm text-muted-foreground">
                  {connected ? "Connected" : "Disconnected"}
                </span>
              </div>

              <Badge variant={serverStatus.online ? "default" : "secondary"} className="gap-1">
                {serverStatus.online ? (
                  <>
                    <Activity className="w-3 h-3" />
                    Online
                  </>
                ) : (
                  <>
                    <Square className="w-3 h-3" />
                    Offline
                  </>
                )}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Players
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {serverStatus.players} / {serverStatus.maxPlayers}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                TPS
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {serverStatus.tps.toFixed(1)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Uptime
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatUptime(serverStatus.uptime)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Cpu className="w-4 h-4" />
                Resources
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CPU:</span>
                  <span className="font-medium">{serverStatus.cpuUsage.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">RAM:</span>
                  <span className="font-medium">{serverStatus.memoryUsage.toFixed(0)} MB</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Server Controls */}
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={handleStartServer}
                disabled={serverStatus.online}
                className="gap-2"
              >
                <Play className="w-4 h-4" />
                Start
              </Button>

              <Button
                onClick={handleStopServer}
                disabled={!serverStatus.online}
                variant="destructive"
                className="gap-2"
              >
                <Square className="w-4 h-4" />
                Stop
              </Button>

              <Button
                onClick={handleRestartServer}
                disabled={!serverStatus.online}
                variant="outline"
                className="gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Restart
              </Button>

              <Separator orientation="vertical" className="h-8 mx-2" />

              <div className="text-sm text-muted-foreground">
                Version: <Badge variant="outline">{serverStatus.version}</Badge>
              </div>

              {serverStatus.pid && (
                <div className="text-sm text-muted-foreground">
                  PID: <Badge variant="outline">{serverStatus.pid}</Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="console" className="gap-2">
              <Terminal className="w-4 h-4" />
              <span className="hidden sm:inline">Console</span>
            </TabsTrigger>
            <TabsTrigger value="players" className="gap-2">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Players</span>
            </TabsTrigger>
            <TabsTrigger value="plugins" className="gap-2">
              <Puzzle className="w-4 h-4" />
              <span className="hidden sm:inline">Plugins</span>
            </TabsTrigger>
            <TabsTrigger value="files" className="gap-2">
              <FolderOpen className="w-4 h-4" />
              <span className="hidden sm:inline">Files</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </TabsTrigger>
          </TabsList>

          {/* Console Tab */}
          <TabsContent value="console" className="space-y-4">
            <Card className="h-[500px] flex flex-col">
              <CardHeader className="py-3 px-4 border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Server Console</CardTitle>
                </div>
                {/* Quick Commands - Official PMMP Commands */}
                <div className="flex gap-1 flex-wrap pt-2">
                  {quickCommands.slice(0, 8).map((qc) => (
                    <Button
                      key={qc.cmd}
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => socketRef.current?.emit("console:command", qc.cmd)}
                    >
                      {qc.label}
                    </Button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="flex-1 p-0 overflow-hidden">
                <ScrollArea className="h-full console-scroll">
                  <div className="p-4 font-mono text-sm space-y-1 bg-black/90 text-green-400">
                    {consoleLogs.length === 0 ? (
                      <div className="text-gray-500">
                        [System] Waiting for server output...
                      </div>
                    ) : (
                      consoleLogs.map((log, index) => (
                        <div key={index} className="flex items-start gap-2">
                          <span className="text-gray-500 text-xs shrink-0">
                            [{new Date(log.timestamp).toLocaleTimeString()}]
                          </span>
                          {getLevelIcon(log.level)}
                          <span className={getLevelColor(log.level)}>
                            {log.message}
                          </span>
                        </div>
                      ))
                    )}
                    <div ref={consoleEndRef} />
                  </div>
                </ScrollArea>
              </CardContent>
              <div className="p-3 border-t">
                <div className="flex gap-2">
                  <Input
                    ref={commandInputRef}
                    placeholder="Enter command..."
                    value={commandInput}
                    onChange={(e) => setCommandInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="font-mono"
                  />
                  <Button onClick={handleSendCommand} className="gap-2">
                    <Send className="w-4 h-4" />
                    Send
                  </Button>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Players Tab */}
          <TabsContent value="players" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Online Players</CardTitle>
                <CardDescription>
                  Manage players currently on the server
                </CardDescription>
              </CardHeader>
              <CardContent>
                {players.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No players online</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {players.map((player) => (
                      <div
                        key={player.uuid}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            {player.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium">{player.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {player.gamemode} | Ping: {player.ping}ms
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => socketRef.current?.emit("player:op", player.name)}
                            title="Give OP"
                          >
                            OP
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => socketRef.current?.emit("player:gamemode", { name: player.name, mode: "creative" })}
                            title="Set Creative mode"
                          >
                            GM 1
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => socketRef.current?.emit("player:gamemode", { name: player.name, mode: "survival" })}
                            title="Set Survival mode"
                          >
                            GM 0
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => socketRef.current?.emit("player:kick", { name: player.name })}
                          >
                            Kick
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => socketRef.current?.emit("player:ban", { name: player.name })}
                          >
                            Ban
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Plugins Tab */}
          <TabsContent value="plugins" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Installed Plugins</CardTitle>
                <CardDescription>
                  Manage server plugins. Download from{" "}
                  <a
                    href="https://poggit.pmmp.io/plugins"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Poggit
                  </a>
                </CardDescription>
              </CardHeader>
              <CardContent>
                {plugins.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Puzzle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No plugins installed</p>
                    <p className="text-sm mt-2">
                      Add .phar files to the plugins/ folder
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {plugins.map((plugin) => (
                      <div
                        key={plugin.name}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center">
                            <Puzzle className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="font-medium">{plugin.name}</div>
                            <div className="text-sm text-muted-foreground">
                              v{plugin.version} | {plugin.description}
                            </div>
                          </div>
                        </div>
                        <Badge variant={plugin.enabled ? "default" : "secondary"}>
                          {plugin.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Files Tab */}
          <TabsContent value="files" className="space-y-4">
            <Card className="h-[600px] flex flex-col">
              <CardHeader className="py-3 px-4 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4" />
                    <CardTitle className="text-sm font-medium">
                      {currentPath}
                    </CardTitle>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => socketRef.current?.emit("file:list", "/")}
                  >
                    Root
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden p-0">
                {editingFile ? (
                  <div className="h-full flex flex-col">
                    <div className="p-2 border-b flex items-center justify-between bg-muted/50">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        <span className="text-sm font-medium">{selectedFile}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={handleSaveFile} className="gap-1">
                          <Save className="w-4 h-4" />
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingFile(false);
                            setSelectedFile(null);
                          }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <textarea
                      value={fileContent}
                      onChange={(e) => setFileContent(e.target.value)}
                      className="flex-1 w-full p-4 font-mono text-sm bg-black/90 text-green-400 resize-none focus:outline-none"
                      spellCheck={false}
                    />
                  </div>
                ) : (
                  <ScrollArea className="h-full">
                    <div className="p-2">
                      {files.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <FolderOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
                          <p>Empty directory</p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {files.map((file) => (
                            <button
                              key={file.path}
                              onClick={() => handleFileClick(file)}
                              className="w-full flex items-center gap-3 p-2 rounded hover:bg-muted text-left"
                            >
                              {file.type === "directory" ? (
                                <Folder className="w-5 h-5 text-primary" />
                              ) : (
                                <File className="w-5 h-5 text-muted-foreground" />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">{file.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {file.type === "file" && formatBytes(file.size)}
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Server Configuration</CardTitle>
                <CardDescription>
                  Edit server.properties. Restart required for changes to take effect.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Server MOTD</label>
                    <Input
                      value={serverConfig.motd || ""}
                      onChange={(e) => setServerConfig({ ...serverConfig, motd: e.target.value })}
                      placeholder="Welcome to my server!"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Server Port</label>
                    <Input
                      value={serverConfig["server-port"] || "19132"}
                      onChange={(e) => setServerConfig({ ...serverConfig, "server-port": e.target.value })}
                      placeholder="19132"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Max Players</label>
                    <Input
                      value={serverConfig["max-players"] || "20"}
                      onChange={(e) => setServerConfig({ ...serverConfig, "max-players": e.target.value })}
                      placeholder="20"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Level Name</label>
                    <Input
                      value={serverConfig["level-name"] || "world"}
                      onChange={(e) => setServerConfig({ ...serverConfig, "level-name": e.target.value })}
                      placeholder="world"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Gamemode</label>
                    <Input
                      value={serverConfig.gamemode || "survival"}
                      onChange={(e) => setServerConfig({ ...serverConfig, gamemode: e.target.value })}
                      placeholder="survival"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Difficulty</label>
                    <Input
                      value={serverConfig.difficulty || "normal"}
                      onChange={(e) => setServerConfig({ ...serverConfig, difficulty: e.target.value })}
                      placeholder="normal"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">View Distance</label>
                    <Input
                      value={serverConfig["view-distance"] || "8"}
                      onChange={(e) => setServerConfig({ ...serverConfig, "view-distance": e.target.value })}
                      placeholder="8"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Language</label>
                    <Input
                      value={serverConfig.language || "eng"}
                      onChange={(e) => setServerConfig({ ...serverConfig, language: e.target.value })}
                      placeholder="eng"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button onClick={handleUpdateConfig} className="gap-2">
                    <Save className="w-4 h-4" />
                    Save Configuration
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t bg-card mt-auto">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4" />
              <span>PocketMine-MP Dashboard</span>
            </div>
            <div className="flex items-center gap-4">
              <span>Version: {serverStatus.version}</span>
              <a
                href="https://doc.pmmp.io"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary"
              >
                Documentation
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
