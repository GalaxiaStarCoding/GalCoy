/**
 * GalCoy TeamTalk5 TCP Proxy — Cloudflare Worker
 *
 * Deploy this on Cloudflare Workers (free tier):
 * 1. Go to https://dash.cloudflare.com → Workers & Pages → Create
 * 2. Name it "galcoy-proxy", paste this entire file, and Deploy
 * 3. Copy the Worker URL (e.g. https://galcoy-proxy.YOUR-SUBDOMAIN.workers.dev)
 * 4. Paste it into src/lib/proxyConfig.js
 *
 * This Worker receives an HTTP POST from the app, opens a TCP connection
 * to the TeamTalk5 server, logs in, finds the channel BY NAME, joins it,
 * and returns the real server data (MOTD, server name, user count, etc).
 */

import { connect } from "cloudflare:sockets";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

const escapeTT = (s) => String(s).replace(/"/g, '\\"');

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405, headers: CORS });
    }

    const { domain, tcp_port, username, password, channel_path } = await request.json();

    if (!domain || !tcp_port || !username || !password) {
      return Response.json({ connected: false, error: "Missing required fields" }, { headers: CORS });
    }

    let socket;
    try {
      socket = connect({ hostname: domain, port: Number(tcp_port) });
    } catch (e) {
      return Response.json({ connected: false, error: `Could not connect: ${e.message}` }, { headers: CORS });
    }

    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    try {
      // Step 1: Read banner
      const { value: bannerData } = await reader.read();
      const banner = decoder.decode(bannerData);

      if (!banner.includes("teamtalk")) {
        return Response.json({ connected: false, error: "Not a TeamTalk5 server" }, { headers: CORS });
      }

      const protoMatch = banner.match(/protocol="([\d.]+)"/);
      const protocol = protoMatch ? protoMatch[1] : "5.10";

      // Step 2: Login
      const loginCmd = `login username="${escapeTT(username)}" password="${escapeTT(password)}" protocol="${protocol}" clientname="GalCoy"\n`;
      await writer.write(encoder.encode(loginCmd));

      // Step 3: Read response (login result + channel list)
      let responseData = "";
      for (let i = 0; i < 8; i++) {
        const { value, done } = await reader.read();
        if (done) break;
        responseData += decoder.decode(value);
        if (responseData.includes("accepted") || responseData.includes("error")) {
          // Read one more chunk for channel list
          try {
            const { value: more, done: moreDone } = await Promise.race([
              reader.read(),
              new Promise((r) => setTimeout(() => r({ done: true }), 1500)),
            ]);
            if (!moreDone && more) responseData += decoder.decode(more);
          } catch {}
          break;
        }
      }

      if (!responseData.includes("accepted")) {
        const errMatch = responseData.match(/message="([^"]*)"/);
        return Response.json(
          { connected: false, error: errMatch ? errMatch[1] : "Authentication failed" },
          { headers: CORS }
        );
      }

      // Step 4: Parse channels and find by name
      const channelRegex = /addchannel channel="([^"]*)" chanid=(\d+)/g;
      const channels = [];
      let m;
      while ((m = channelRegex.exec(responseData)) !== null) {
        channels.push({ name: m[1], id: m[2] });
      }

      const normalize = (p) => p.replace(/\/+$/, "");
      const target = channels.find((c) => normalize(c.name) === normalize(channel_path || "/"));

      if (!target) {
        return Response.json(
          {
            connected: true,
            joined: false,
            error: `Channel "${channel_path}" not found`,
            available: channels.map((c) => c.name),
          },
          { headers: CORS }
        );
      }

      // Step 5: Join channel by ID (matched from name)
      await writer.write(encoder.encode(`join chanid=${target.id}\n`));

      let joinResponse = "";
      for (let i = 0; i < 5; i++) {
        const { value, done } = await reader.read();
        if (done) break;
        joinResponse += decoder.decode(value);
        if (joinResponse.includes("joined") || joinResponse.includes("error")) break;
      }

      const serverNameMatch = responseData.match(/servername="([^"]*)"/);
      const motdMatch = responseData.match(/motd="([^"]*)"/);
      const userCount = (responseData.match(/adduser/g) || []).length;

      if (joinResponse.includes("joined")) {
        return Response.json(
          {
            connected: true,
            joined: true,
            channelName: target.name,
            channelId: target.id,
            serverName: serverNameMatch ? serverNameMatch[1] : domain,
            motd: motdMatch ? motdMatch[1] : "",
            userCount,
          },
          { headers: CORS }
        );
      } else {
        const errMatch = joinResponse.match(/message="([^"]*)"/);
        return Response.json(
          { connected: true, joined: false, error: errMatch ? errMatch[1] : "Could not join channel" },
          { headers: CORS }
        );
      }
    } catch (error) {
      return Response.json({ connected: false, error: error.message }, { headers: CORS });
    } finally {
      try {
        writer.releaseLock();
        reader.releaseLock();
        socket.close();
      } catch {}
    }
  },
};