/**
 * GalCoy TeamTalk5 Bot Server — Standalone Node.js (CommonJS)
 *
 * Deploy on any free Node.js host (Render, Glitch, Replit, etc.):
 *
 * RENDER (recommended):
 *   1. Go to https://render.com → New → Web Service
 *   2. Connect your repo, or use "Create from scratch"
 *   3. Build Command: (leave empty)
 *   4. Start Command: node server.cjs
 *   5. After deploy, copy the URL (e.g. https://your-app.onrender.com)
 *   6. Paste it into src/lib/proxyConfig.js
 *
 * This server receives HTTP requests from the published app, opens TCP/UDP
 * connections to the TeamTalk5 server, logs in, joins a channel, keeps the
 * session alive, handles PMs (h, u commands), and exposes status/unmute
 * endpoints.
 *
 * Protocol (from TeamTalk5 source code):
 *   TCP: login → accepted → (channels/users auto-sent) → ok → join → joined
 *   UDP: HELLO packet (11 bytes) → server responds → periodic KEEPALIVE (8 bytes)
 */
/* eslint-disable no-undef */

const http = require("http");
const net = require("net");
const dgram = require("dgram");
const crypto = require("crypto");
const { Buffer } = require("buffer");

const PORT = process.env.PORT || 3000;

// ── Helpers ──────────────────────────────────────────────

const escapeTT = (s) => String(s)
  .replace(/\\/g, "\\\\")
  .replace(/"/g, '\\"')
  .replace(/\r/g, "\\r")
  .replace(/\n/g, "\\n");

const channelNameFromPath = (path) =>
  String(path || "").replace(/^\/+/, "").replace(/\/+$/, "").trim();

// ── Packet Builders ─────────────────────────────────────

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

// ── Command Help Text ────────────────────────────────────

const COMMAND_HELP_TEXT = `GalCoy Bot Commands:
h - Shows command help
u [url] - Plays a stream/file from a direct URL
s - Stops playback`;

// ── Stream Metadata ─────────────────────────────────────

async function fetchWithTimeout(targetUrl, ms = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(targetUrl, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extractAzuraCastMetadata(data) {
  const stationName = data?.station?.name || "";
  const songName =
    data?.now_playing?.song?.text ||
    data?.now_playing?.song?.title ||
    "";
  if (!stationName && !songName) return null;
  return { stationName, songName };
}

async function fetchAzuraCastMetadata(streamUrl) {
  try {
    const url = new URL(streamUrl);
    const host = url.origin;

    const listenMatch = url.pathname.match(/\/listen\/([^/]+)/i);
    if (listenMatch) {
      const shortcode = listenMatch[1];
      try {
        const resp = await fetchWithTimeout(`${host}/api/nowplaying/${encodeURIComponent(shortcode)}`);
        if (resp.ok) {
          const data = await resp.json();
          return extractAzuraCastMetadata(data);
        }
      } catch {}
    }

    const allResp = await fetchWithTimeout(`${host}/api/nowplaying`);
    if (allResp.ok) {
      const stations = await allResp.json();
      for (const station of stations) {
        const listenUrl = station.station?.listen_url;
        const mounts = station.station?.mounts || [];
        const remoteUrls = station.station?.remotes?.map((r) => r.url) || [];
        const allStreamUrls = [listenUrl, ...mounts.map((m) => m.url), ...remoteUrls].filter(Boolean);
        if (allStreamUrls.some((u) => u && (u === streamUrl || streamUrl.startsWith(u)))) {
          return extractAzuraCastMetadata(station);
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchICYMetadata(streamUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await fetch(streamUrl, {
      headers: { "Icy-MetaData": "1" },
      signal: controller.signal,
    });

    const stationName = resp.headers.get("icy-name") || "";
    const metaintStr = resp.headers.get("icy-metaint");
    const metaint = metaintStr ? parseInt(metaintStr, 10) : 0;

    let songName = "";

    if (metaint > 0 && resp.body) {
      const reader = resp.body.getReader();
      try {
        let allData = new Uint8Array(0);
        const targetLen = metaint + 1 + 4096;

        while (allData.length < targetLen) {
          const { done, value } = await reader.read();
          if (done) break;
          const combined = new Uint8Array(allData.length + value.length);
          combined.set(allData);
          combined.set(value, allData.length);
          allData = combined;
        }

        if (allData.length > metaint) {
          const metaLen = allData[metaint] * 16;
          if (metaLen > 0 && allData.length >= metaint + 1 + metaLen) {
            const metaBytes = allData.slice(metaint + 1, metaint + 1 + metaLen);
            const metaStr = new TextDecoder().decode(metaBytes).replace(/\0/g, "");
            const titleMatch = metaStr.match(/StreamTitle='([^']*)'/);
            if (titleMatch) songName = titleMatch[1];
          }
        }
      } finally {
        reader.cancel();
      }
    }

    clearTimeout(timer);

    if (stationName || songName) {
      return { stationName, songName };
    }
    return null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

async function fetchStreamMetadata(streamUrl) {
  const azuraCast = await fetchAzuraCastMetadata(streamUrl);
  if (azuraCast) return azuraCast;
  return await fetchICYMetadata(streamUrl);
}

// ── Session Management ───────────────────────────────────

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
    let dataPhaseTimer = null;

    session.tcpSocket = tcpSocket;
    session.udpSocket = udpSocket;

    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      if (safetyTimeout) clearTimeout(safetyTimeout);
      if (dataPhaseTimer) clearTimeout(dataPhaseTimer);
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

    const startKeepalive = () => {
      const udpAddr = domain;
      const udpPort = Number(udp_port || tcp_port);
      udpSocket.bind(0, () => {
        try { udpSocket.send(buildHelloPacket(userId), udpPort, udpAddr); } catch {}
        session.udpKeepaliveTimer = setInterval(() => {
          try { udpSocket.send(buildKeepAlivePacket(userId), udpPort, udpAddr); } catch {}
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
          if (msgType !== 1) continue;
          const srcMatch = packet.match(/srcuserid=(\d+)/);
          const contentMatch = packet.match(/content="((?:[^"\\]|\\.)*)"/);
          if (srcMatch && contentMatch) {
            const fromUserId = parseInt(srcMatch[1], 10);
            const content = contentMatch[1].replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
            handlePM(fromUserId, content);
          }
          continue;
        }
      }
    });

    tcpSocket.on("timeout", () => { finish({ connected: false, error: "Connection timeout at phase: " + phase }); });
    tcpSocket.on("error", (err) => { finish({ connected: false, error: err.message }); });
    tcpSocket.on("close", () => { finish({ connected: false, error: "Connection closed by server" }); closeConnection(session); });

    tcpSocket.connect(Number(tcp_port), domain);
  });
}

// ── HTTP Server ──────────────────────────────────────────

function sendJson(res, statusCode, payload) {
  if (res.headersSent) return;
  try {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  } catch (e) {
    console.error("Failed to send response:", e);
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

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlObj = new URL(req.url, "http://localhost");
  const route = urlObj.pathname.replace("/tt-proxy/", "").replace(/^\//, "").split("?")[0];

  // GET routes ───────────────────────────────────────────

  if (req.method === "GET" && route === "ping") {
    sendJson(res, 200, { ok: true, message: "Bot proxy is running" });
    return;
  }

  if (req.method === "GET" && route === "status") {
    const sid = urlObj.searchParams.get("sessionId");
    const session = sid ? connections.get(sid) : null;
    sendJson(res, 200, { botStatus: session?.botStatus || { status: "idle", stationName: "", songName: "" } });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  // POST routes ──────────────────────────────────────────

  let data;
  try {
    const body = await readBody(req);
    data = JSON.parse(body);
  } catch {
    sendJson(res, 400, { connected: false, error: "Invalid JSON in request" });
    return;
  }

  if (route === "connect") {
    try {
      const result = await connectToTeamTalk(data);
      sendJson(res, 200, result);
    } catch (err) {
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
        sendJson(res, 200, { unmuted: true });
      } catch (e) {
        sendJson(res, 200, { unmuted: false, error: e.message });
      }
    } else {
      sendJson(res, 200, { unmuted: false, error: "No active session" });
    }
    return;
  }

  sendJson(res, 404, { error: "Not found", route });
});

server.listen(PORT, () => {
  console.log(`GalCoy bot server running on port ${PORT}`);
});
