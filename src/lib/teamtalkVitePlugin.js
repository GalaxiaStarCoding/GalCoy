/**
 * GalCoy TeamTalk5 Bot Proxy — Vite Middleware
 *
 * Runs as Vite middleware (no standalone server, no proxy forwarding).
 * Handles /tt-proxy/connect and /tt-proxy/disconnect directly.
 *
 * Protocol (from TeamTalk5 source code):
 *   TCP: login → accepted → (channels/users auto-sent) → ok → join → joined
 *   UDP: HELLO packet (11 bytes) → server responds → periodic KEEPALIVE (8 bytes)
 */
import net from "net";
import dgram from "dgram";
import crypto from "crypto";
import { Buffer } from "buffer";
import fs from "fs";
import { COMMAND_HELP_TEXT, fetchStreamMetadata } from "./botCommands.js";

const LOG_FILE = "/tmp/tt-proxy.log";
let logSize = 0;
function log(msg) {
  if (logSize > 500000) return; // cap at 500KB
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); logSize += line.length; } catch {}
}

const escapeTT = (s) => String(s)
  .replace(/\\/g, "\\\\")
  .replace(/"/g, '\\"')
  .replace(/\r/g, "\\r")
  .replace(/\n/g, "\\n");
const channelNameFromPath = (path) =>
  String(path || "").replace(/^\/+/, "").replace(/\/+$/, "").trim();

function buildPacketHeader(kind, userId, timestamp) {
  const buf = Buffer.alloc(8);
  buf[0] = kind & 0x7f;
  buf[1] = userId & 0xff;
  buf[2] = (userId >> 8) & 0x0f;
  buf[3] = 0x00;
  buf.writeUInt32LE(timestamp >>> 0, 4);
  return buf;
}

function buildHelloPacket(userId) {
  const header = buildPacketHeader(1, userId, Date.now() >>> 0);
  const field = Buffer.alloc(3);
  field[0] = 0x01;
  field[1] = 0x10;
  field[2] = 0x01;
  return Buffer.concat([header, field]);
}

function buildKeepAlivePacket(userId) {
  return buildPacketHeader(2, userId, Date.now() >>> 0);
}

const connections = new Map();

function closeConnection(session) {
  if (!session) return;
  if (session.udpKeepaliveTimer) clearInterval(session.udpKeepaliveTimer);
  if (session.udpSocket) { try { session.udpSocket.close(); } catch {} }
  if (session.tcpSocket) { try { session.tcpSocket.destroy(); } catch {} }
  if (session.sessionId) connections.delete(session.sessionId);
}

function connectToTeamTalk({ domain, tcp_port, udp_port, username, password, channel_path, bot_name }) {
  return new Promise((resolve) => {
    const targetChannelName = channelNameFromPath(channel_path);
    const sessionId = crypto.randomUUID();
    const session = { sessionId, domain, botStatus: { status: 'idle', stationName: '', songName: '' } };
    connections.set(sessionId, session);

    const tcpSocket = new net.Socket();
    const udpSocket = dgram.createSocket("udp4");
    let buffer = "";
    let phase = "banner";
    let foundChanid = null;
    let userId = 0;
    let serverName = domain;
    let motd = "";
    let userCount = 0;
    let resolved = false;
    let safetyTimeout = null;

    session.tcpSocket = tcpSocket;
    session.udpSocket = udpSocket;

    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      if (safetyTimeout) clearTimeout(safetyTimeout);
      if (dataPhaseTimer) clearTimeout(dataPhaseTimer);
      log("finish: " + JSON.stringify({ ...result, sessionId }));
      if (result.connected && result.joined) {
        phase = "post_join";
        tcpSocket.setTimeout(0);
        send(`changestatus statusmode=0 statusmsg="${escapeTT('Type "h" for further information')}"`);
      } else {
        closeConnection(session);
      }
      resolve({ ...result, sessionId });
    };

    const send = (cmd) => tcpSocket.write(cmd + "\r\n");

    const sendPM = (toUserId, text) => {
      send(`message type=1 destuserid=${toUserId} content="${escapeTT(text)}"`);
    };

    const setStatus = (statusMsg) => {
      send(`changestatus statusmode=0 statusmsg="${escapeTT(statusMsg)}"`);
    };

    const handlePM = (fromUserId, content) => {
      const trimmed = content.trim();
      const lower = trimmed.toLowerCase();
      if (lower === "h") {
        sendPM(fromUserId, COMMAND_HELP_TEXT);
        return;
      }
      if (lower === "u" || lower.startsWith("u ")) {
        const url = trimmed.slice(1).trim();
        if (!url) {
          sendPM(fromUserId, "Usage: u [url] — Provide an AzuraCast MP3 stream URL");
          return;
        }
        handleStreamCommand(fromUserId, url);
        return;
      }
    };

    const handleStreamCommand = async (fromUserId, streamUrl) => {
      try {
        sendPM(fromUserId, "Now Loading, Please wait...");
        session.botStatus = { status: 'loading', stationName: '', songName: '', streamUrl };
        setStatus("Loading stream...");

        // Fetch now-playing metadata
        const metadata = await fetchStreamMetadata(streamUrl);
        await new Promise((r) => setTimeout(r, 5000));
        if (metadata && (metadata.stationName || metadata.songName)) {
          session.botStatus = { status: 'playing', stationName: metadata.stationName || "Stream", songName: metadata.songName || "Unknown", streamUrl };
          setStatus(`Now Playing On ${metadata.stationName || "Stream"}: ${metadata.songName || "Unknown"}`);
        } else {
          session.botStatus = { status: 'playing', stationName: "Stream", songName: "Unknown", streamUrl };
          setStatus("Now Playing: Unknown Stream");
        }
      } catch (e) {
        log("handleStreamCommand error: " + e.message);
        sendPM(fromUserId, "Error loading stream: " + (e.message || "unknown error"));
      }
    };

    const proceedAfterData = () => {
      if (phase !== "receiving_data" || resolved) return;
      if (!targetChannelName) {
        startKeepalive();
        finish({ connected: true, joined: true, channelName: "Root", serverName, motd, userCount });
        return;
      }
      if (foundChanid) {
        phase = "awaiting_join";
        send(`join chanid=${foundChanid}`);
      } else {
        finish({ connected: true, joined: false, error: `Channel "${targetChannelName}" not found on server` });
      }
    };
    let dataPhaseTimer = null;

    const startKeepalive = () => {
      const udpAddr = domain;
      const udpPort = Number(udp_port || tcp_port);
      udpSocket.bind(0, () => {
        try { udpSocket.send(buildHelloPacket(userId), udpPort, udpAddr); } catch (e) { log("UDP hello send error: " + e.message); }
        session.udpKeepaliveTimer = setInterval(() => {
          try { udpSocket.send(buildKeepAlivePacket(userId), udpPort, udpAddr); } catch (e) { log("UDP keepalive send error: " + e.message); }
        }, 5000);
      });
    };

    tcpSocket.setTimeout(45000);
    safetyTimeout = setTimeout(() => {
      finish({ connected: false, error: "Connection timed out — server did not respond in time" });
    }, 55000);

    udpSocket.on("message", () => {});
    udpSocket.on("error", () => {});

    tcpSocket.on("data", (data) => {
      buffer += data.toString();
      let lines = buffer.split("\r\n");
      buffer = lines.pop();

      for (const line of lines) {
        const packet = line.trim();
        if (!packet) continue;
        log("packet [" + phase + "]: " + packet.slice(0, 200));

        if (phase === "banner" && packet.startsWith("teamtalk")) {
          phase = "awaiting_login";
          const nickname = bot_name ? escapeTT(bot_name) : "GalCoy";
          send(`login nickname="${nickname}" username="${escapeTT(username)}" password="${escapeTT(password)}"`);
          continue;
        }

        if (phase === "awaiting_login" && packet.startsWith("accepted")) {
          const uidMatch = packet.match(/userid=(\d+)/);
          if (uidMatch) userId = parseInt(uidMatch[1], 10);
          phase = "receiving_data";
          continue;
        }

        if (phase === "awaiting_login" && packet.startsWith("error")) {
          const errMatch = packet.match(/message="([^"]*)"/);
          finish({ connected: false, error: errMatch ? errMatch[1] : "Authentication failed" });
          return;
        }

        if (phase === "receiving_data" && packet.startsWith("serverupdate")) {
          const snMatch = packet.match(/servername="([^"]*)"/);
          const motdMatch = packet.match(/motd="([^"]*)"/);
          if (snMatch) serverName = snMatch[1];
          if (motdMatch) motd = motdMatch[1];
          if (dataPhaseTimer) clearTimeout(dataPhaseTimer);
          dataPhaseTimer = setTimeout(proceedAfterData, 3000);
          continue;
        }

        if (phase === "receiving_data" && packet.startsWith("addchannel")) {
          const chanidMatch = packet.match(/chanid=(\d+)/);
          const nameMatch = packet.match(/name="([^"]+)"/);
          if (chanidMatch && nameMatch && !foundChanid && nameMatch[1] === targetChannelName) {
            foundChanid = chanidMatch[1];
          }
          continue;
        }

        if (phase === "receiving_data" && packet.startsWith("adduser")) {
          userCount++;
          continue;
        }

        if (phase === "receiving_data" && (packet === "ok" || packet.startsWith("ok "))) {
          if (dataPhaseTimer) clearTimeout(dataPhaseTimer);
          if (!targetChannelName) {
            startKeepalive();
            finish({ connected: true, joined: true, channelName: "Root", serverName, motd, userCount });
            return;
          }
          if (foundChanid) {
            phase = "awaiting_join";
            send(`join chanid=${foundChanid}`);
          } else {
            finish({ connected: true, joined: false, error: `Channel "${targetChannelName}" not found on server` });
            return;
          }
          continue;
        }

        if (phase === "awaiting_join" && packet.startsWith("joined")) {
          startKeepalive();
          finish({ connected: true, joined: true, channelName: targetChannelName, channelId: Number(foundChanid), serverName, motd, userCount });
          return;
        }

        if (phase === "awaiting_join" && packet.startsWith("error")) {
          const errMatch = packet.match(/message="([^"]*)"/);
          finish({ connected: true, joined: false, error: errMatch ? errMatch[1] : "Could not join channel" });
          return;
        }

        if (phase === "post_join" && packet.startsWith("messagedeliver")) {
          const typeMatch = packet.match(/type=(\d+)/);
          const msgType = typeMatch ? parseInt(typeMatch[1], 10) : 0;
          if (msgType !== 1) continue; // Only handle text messages, not typing notifications
          const srcMatch = packet.match(/srcuserid=(\d+)/);
          const contentMatch = packet.match(/content="((?:[^"\\]|\\.)*)"/);
          if (srcMatch && contentMatch) {
            const fromUserId = parseInt(srcMatch[1], 10);
            const content = contentMatch[1].replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
            log("PM from " + fromUserId + ": " + content.slice(0, 100));
            handlePM(fromUserId, content);
          }
          continue;
        }
      }
    });

    tcpSocket.on("timeout", () => { log("TCP timeout at phase: " + phase); finish({ connected: false, error: "Connection timeout at phase: " + phase }); });
    tcpSocket.on("error", (err) => { log("TCP error: " + err.message); finish({ connected: false, error: err.message }); });
    tcpSocket.on("close", () => { log("TCP close (hadError)"); finish({ connected: false, error: "Connection closed by server" }); closeConnection(session); });

    tcpSocket.connect(Number(tcp_port), domain);
  });
}

function sendJson(res, statusCode, payload) {
  if (res.headersSent) return;
  try {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  } catch (e) {
    console.error("[teamtalk-proxy] Failed to send response:", e);
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

export function teamtalkProxy() {
  return {
    name: "teamtalk-proxy",
    configureServer(server) {
      // Add middleware DIRECTLY (not via return function) so it runs
      // BEFORE Vite's internal middleware (including SPA fallback).
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || "";
        if (!url.startsWith("/tt-proxy")) {
          return next();
        }

        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");

        if (req.method === "OPTIONS") {
          res.writeHead(204);
          res.end();
          return;
        }

        const route = url.replace("/tt-proxy/", "").replace("/", "").split("?")[0];

        if (req.method === "GET" && route === "ping") {
          sendJson(res, 200, { ok: true, message: "Bot proxy is running (middleware)" });
          return;
        }

        if (req.method === "GET" && route === "status") {
          const urlObj = new URL(req.url, "http://localhost");
          const sid = urlObj.searchParams.get("sessionId");
          const session = sid ? connections.get(sid) : null;
          sendJson(res, 200, { botStatus: session?.botStatus || { status: "idle", stationName: "", songName: "" } });
          return;
        }

        if (req.method !== "POST") {
          sendJson(res, 405, { error: "Method not allowed" });
          return;
        }

        let data;
        try {
          const body = await readBody(req);
          data = JSON.parse(body);
        } catch {
          sendJson(res, 400, { connected: false, error: "Invalid JSON in request" });
          return;
        }

        if (route === "connect") {
          log("connect request: " + JSON.stringify({ domain: data.domain, tcp_port: data.tcp_port, channel: data.channel_path, bot_name: data.bot_name }));
          try {
            const result = await connectToTeamTalk(data);
            log("connect response sent: " + JSON.stringify(result));
            sendJson(res, 200, result);
          } catch (err) {
            log("connect error: " + (err?.stack || err?.message || String(err)));
            sendJson(res, 200, { connected: false, error: err.message || "Internal proxy error" });
          }
          return;
        }

        if (route === "disconnect") {
          const session = connections.get(data.sessionId);
          if (session) {
            try { session.tcpSocket?.write("logout\r\n"); } catch {}
            setTimeout(() => closeConnection(session), 100);
          }
          sendJson(res, 200, { disconnected: true });
          return;
        }

        if (route === "unmute") {
          const session = connections.get(data.sessionId);
          if (session && session.tcpSocket) {
            try {
              const msg = data.statusMsg || "Unmuted - Ready to Stream";
              session.tcpSocket.write(`changestatus statusmode=0 statusmsg="${escapeTT(msg)}"\r\n`);
              log("unmute: changestatus sent");
              sendJson(res, 200, { unmuted: true });
            } catch (e) {
              log("unmute error: " + e.message);
              sendJson(res, 200, { unmuted: false, error: e.message });
            }
          } else {
            sendJson(res, 200, { unmuted: false, error: "No active session" });
          }
          return;
        }

        sendJson(res, 404, { error: "Not found", route });
      });
    },
  };
}