/**
 * GalCoy TeamTalk5 Bot Server — Standalone Node.js
 *
 * Run locally:  node server.js
 * The app connects to http://localhost:3000 (set in src/lib/proxyConfig.js)
 *
 * Protocol (from TeamTalk5 source code Commands.h):
 *   Client→Server: login, join, leave, message, ping, etc.
 *   Server→Client: teamtalk(banner), accepted, serverupdate, addchannel,
 *                  loggedin, adduser, ok, joined, error
 *
 * Flow:
 *   1. Connect TCP → receive "teamtalk" banner
 *   2. Send "login nickname=... username=... password=..."
 *   3. Receive "accepted" → server auto-sends channels + users
 *   4. Receive "ok" (end of data burst)
 *   5. Send "join chanid=X" → receive "joined chanid=X"
 */
/* eslint-disable no-undef */

const http = require("http");
const net = require("net");

const PORT = process.env.PORT || 3000;

const escapeTT = (s) => String(s).replace(/"/g, '\\"');
const channelNameFromPath = (path) =>
  String(path || "").replace(/^\/+/, "").replace(/\/+$/, "").trim();

function connectToTeamTalk({ domain, tcp_port, username, password, channel_path, bot_name }) {
  return new Promise((resolve) => {
    const targetChannelName = channelNameFromPath(channel_path);
    const socket = new net.Socket();
    let buffer = "";
    let phase = "banner";
    let foundChanid = null;
    let serverName = domain;
    let motd = "";
    let userCount = 0;
    let resolved = false;

    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(result);
    };

    const send = (cmd) => socket.write(cmd + "\r\n");
    socket.setTimeout(10000);

    socket.on("data", (data) => {
      buffer += data.toString();
      let lines = buffer.split("\r\n");
      buffer = lines.pop();

      for (const line of lines) {
        const packet = line.trim();
        if (!packet) continue;

        // Step 1: Banner — send login
        if (phase === "banner" && packet.startsWith("teamtalk")) {
          phase = "awaiting_login";
          const nickname = bot_name ? escapeTT(bot_name) : "GalCoy";
          send(
            `login nickname="${nickname}" username="${escapeTT(username)}" password="${escapeTT(password)}"`
          );
          continue;
        }

        // Step 2: Login accepted — server will auto-send channels + users
        if (phase === "awaiting_login" && packet.startsWith("accepted")) {
          phase = "receiving_data";
          continue;
        }

        if (phase === "awaiting_login" && packet.startsWith("error")) {
          const errMatch = packet.match(/message="([^"]*)"/);
          finish({
            connected: false,
            error: errMatch ? errMatch[1] : "Authentication failed",
          });
          return;
        }

        // Step 3: Parse server update for MOTD/server name
        if (phase === "receiving_data" && packet.startsWith("serverupdate")) {
          const snMatch = packet.match(/servername="([^"]*)"/);
          const motdMatch = packet.match(/motd="([^"]*)"/);
          if (snMatch) serverName = snMatch[1];
          if (motdMatch) motd = motdMatch[1];
          continue;
        }

        // Parse channels — look for target channel
        if (phase === "receiving_data" && packet.startsWith("addchannel")) {
          const chanidMatch = packet.match(/chanid=(\d+)/);
          const nameMatch = packet.match(/name="([^"]+)"/);
          if (chanidMatch && nameMatch && !foundChanid) {
            if (nameMatch[1] === targetChannelName) {
              foundChanid = chanidMatch[1];
            }
          }
          continue;
        }

        // Count users
        if (phase === "receiving_data" && packet.startsWith("adduser")) {
          userCount++;
          continue;
        }

        // Step 4: "ok" means data burst is done — join channel
        if (phase === "receiving_data" && packet === "ok") {
          if (foundChanid) {
            phase = "awaiting_join";
            send(`join chanid=${foundChanid}`);
          } else {
            finish({
              connected: true,
              joined: false,
              error: `Channel "${targetChannelName}" not found`,
            });
            return;
          }
          continue;
        }

        // Step 5: Joined successfully
        if (phase === "awaiting_join" && packet.startsWith("joined")) {
          finish({
            connected: true,
            joined: true,
            channelName: targetChannelName,
            channelId: Number(foundChanid),
            serverName,
            motd,
            userCount,
          });
          return;
        }

        if (phase === "awaiting_join" && packet.startsWith("error")) {
          const errMatch = packet.match(/message="([^"]*)"/);
          finish({
            connected: true,
            joined: false,
            error: errMatch ? errMatch[1] : "Could not join channel",
          });
          return;
        }
      }
    });

    socket.on("timeout", () => {
      finish({ connected: false, error: "Connection timeout at phase: " + phase });
    });

    socket.on("error", (err) => {
      finish({ connected: false, error: err.message });
    });

    socket.connect(Number(tcp_port), domain);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  let body = "";
  for await (const chunk of req) body += chunk;

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ connected: false, error: "Invalid JSON" }));
    return;
  }

  const result = await connectToTeamTalk(data);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result));
});

server.listen(PORT, () => {
  console.log(`GalCoy bot server running on port ${PORT}`);
});