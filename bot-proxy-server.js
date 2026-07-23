/**
 * GalCoy TeamTalk5 Bot Proxy — Standalone HTTP Server
 * Run with: node bot-proxy-server.js
 * Listens on port 3137, handles /tt-proxy/connect and /tt-proxy/disconnect
 */
import net from "net";
import dgram from "dgram";
import crypto from "crypto";
import http from "http";
import { Buffer } from "buffer";

const escapeTT = (s) => String(s).replace(/"/g, '\\"');
const channelNameFromPath = (path) =>
  String(path || "").replace(/^\/+/, "").replace(/\/+$/, "").trim();

function buildPacketHeader(kind, userId, timestamp) {
  const buf = Buffer.alloc(8);
  buf[0] = kind & 0x7f;
  buf[1] = userId & 0xff;
  buf[2] = (userId >> 8) & 0x0f;
  buf[3] = 0x00;
  buf.writeUInt32LE(timestamp, 4);
  return buf;
}

function buildHelloPacket(userId) {
  const header = buildPacketHeader(1, userId, Date.now() & 0xffffffff);
  const field = Buffer.alloc(3);
  field[0] = 0x01;
  field[1] = 0x10;
  field[2] = 0x01;
  return Buffer.concat([header, field]);
}

function buildKeepAlivePacket(userId) {
  return buildPacketHeader(2, userId, Date.now() & 0xffffffff);
}

const connections = new Map();

function closeConnection(session) {
  if (!session) return;
  if (session.tcpKeepaliveTimer) clearInterval(session.tcpKeepaliveTimer);
  if (session.udpKeepaliveTimer) clearInterval(session.udpKeepaliveTimer);
  if (session.udpSocket) { try { session.udpSocket.close(); } catch {} }
  if (session.tcpSocket) { try { session.tcpSocket.destroy(); } catch {} }
  if (session.sessionId) connections.delete(session.sessionId);
}

function connectToTeamTalk({ domain, tcp_port, udp_port, username, password, channel_path, bot_name }) {
  return new Promise((resolve) => {
    const targetChannelName = channelNameFromPath(channel_path);
    const sessionId = crypto.randomUUID();
    const session = { sessionId, domain };
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
      if (!result.connected || !result.joined) closeConnection(session);
      resolve({ ...result, sessionId });
    };

    const send = (cmd) => tcpSocket.write(cmd + "\r\n");

    const startKeepalive = () => {
      const udpAddr = domain;
      const udpPort = Number(udp_port || tcp_port);
      udpSocket.bind(0, () => {
        udpSocket.send(buildHelloPacket(userId), udpPort, udpAddr);
        session.udpKeepaliveTimer = setInterval(() => {
          try { udpSocket.send(buildKeepAlivePacket(userId), udpPort, udpAddr); } catch {}
        }, 5000);
      });
      // TeamTalk5 uses UDP keepalive only — no TCP ping needed
    };

    tcpSocket.setTimeout(20000);
    safetyTimeout = setTimeout(() => {
      finish({ connected: false, error: "Connection timed out — server did not respond in time" });
    }, 25000);
    udpSocket.on("message", () => {});
    udpSocket.on("error", () => {});

    tcpSocket.on("data", (data) => {
      buffer += data.toString();
      let lines = buffer.split("\r\n");
      buffer = lines.pop();

      for (const line of lines) {
        const packet = line.trim();
        if (!packet) continue;

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
      }
    });

    tcpSocket.on("timeout", () => finish({ connected: false, error: "Connection timeout at phase: " + phase }));
    tcpSocket.on("error", (err) => finish({ connected: false, error: err.message }));
    tcpSocket.on("close", () => { finish({ connected: false, error: "Connection closed by server" }); closeConnection(session); });

    tcpSocket.connect(Number(tcp_port), domain);
  });
}

const PROXY_PORT = 3137;

function sendJson(res, statusCode, payload) {
  try {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  } catch (e) {
    console.error("[teamtalk-proxy] Failed to send response:", e);
  }
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = req.url || "";
  const route = url.replace("/tt-proxy/", "").replace("/", "").split("?")[0];

  if (req.method === "GET" && route === "ping") {
    sendJson(res, 200, { ok: true, message: "Bot proxy is running" });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    let data;
    try { data = JSON.parse(body); }
    catch { sendJson(res, 400, { connected: false, error: "Invalid JSON in request" }); return; }

    if (route === "connect") {
      connectToTeamTalk(data)
        .then((result) => sendJson(res, 200, result))
        .catch((err) => sendJson(res, 200, { connected: false, error: err.message || "Internal proxy error" }));
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

    sendJson(res, 404, { error: "Not found", route });
  });

  req.on("error", () => sendJson(res, 400, { connected: false, error: "Failed to read request" }));
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`[teamtalk-proxy] Port ${PROXY_PORT} already in use`);
  } else {
    console.error("[teamtalk-proxy] Server error:", e.message);
  }
});

server.listen(PROXY_PORT, () => {
  console.log(`[teamtalk-proxy] Bot proxy listening on port ${PROXY_PORT}`);
});