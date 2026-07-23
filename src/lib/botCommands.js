/**
 * GalCoy Bot — shared command definitions and AzuraCast metadata fetching.
 * Used by the Vite middleware (teamtalkVitePlugin.js).
 */

export const COMMAND_HELP_TEXT = `GalCoy Bot Commands:
h - Shows command help
p [query] - Plays tracks found for query. If no query, pauses/resumes
u [url] - Plays a stream/file from a direct URL
s - Stops playback
n - Plays the next track
b - Plays the previous track
v [0-100] - Sets volume. No arg shows current volume
sb [seconds] - Seeks backward. Default step if no arg
sf [seconds] - Seeks forward. Default step if no arg
c [number] - Selects a track by number from search results
m [mode] - Sets playback mode: SingleTrack, RepeatTrack, TrackList, RepeatTrackList, Random
sp [0.25-4] - Sets playback speed
sv [service] - Switches service (e.g., sv yt, sv ytm)
f [+/-][num] - Favorites management. f lists. f + adds current. f - removes. f [num] plays
gl - Gets a direct link to the current track
dl - Downloads current track and uploads to channel
dlv - Downloads current track as video and uploads it to the channel
dlp [url] - Downloads all tracks from a playlist/album URL, zips them, and uploads to the channel
aad [link] - Adds a single link/URL to your custom download list
ad [links] - Adds multiple space-separated links to the download list
ld - Lists all links currently in the download list
rd [number/link] - Removes a link from the download list by its index or URL
ldd [link] - Downloads a link directly and uploads to the TeamTalk channel
ads [1/2] - Downloads list: Option 1 (Normal sequentially) or Option 2 (ZIP compressed)
adsc - Toggles local download mode: saves files locally to the VPS instead of uploading
r [number] - Plays from Recents. r lists recents
jc - Makes the bot join your current channel
qa [query] - Adds a track to the queue
ql - Lists all tracks currently in the queue
qr [number] - Removes a specific track from the queue
qc - Clears the entire queue
qs - Skips current track and plays the next one from the queue
sr [on/off] - Toggles Search Results Mode
sl [number] - Selects and plays result NUMBER from the last sr search list
slc [number] - Sets how many results are shown in sr mode (default 5)
a - Shows about info`;

/**
 * Fetch now-playing metadata from a stream URL.
 * Tries AzuraCast API first, then falls back to ICY (Icecast) metadata.
 * Returns { stationName, songName } or null if not available.
 */
export async function fetchStreamMetadata(streamUrl) {
  // Try AzuraCast API first
  const azuraCast = await fetchAzuraCastMetadata(streamUrl);
  if (azuraCast) return azuraCast;

  // Fallback: ICY metadata from Icecast stream
  return await fetchICYMetadata(streamUrl);
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

function extractAzuraCastMetadata(data) {
  const stationName = data?.station?.name || "";
  const songName =
    data?.now_playing?.song?.text ||
    data?.now_playing?.song?.title ||
    "";
  if (!stationName && !songName) return null;
  return { stationName, songName };
}

/**
 * Fetch ICY (Icecast) metadata from a stream URL.
 * Gets station name from icy-name header and song title from ICY metadata blocks.
 */
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
        // Accumulate data until we have the audio block + metadata length byte + metadata block
        let allData = new Uint8Array(0);
        const targetLen = metaint + 1 + 4096; // audio + length byte + metadata (max 16*255)

        while (allData.length < targetLen) {
          const { done, value } = await reader.read();
          if (done) break;
          const combined = new Uint8Array(allData.length + value.length);
          combined.set(allData);
          combined.set(value, allData.length);
          allData = combined;
        }

        // Parse metadata length byte at position metaint
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

async function fetchWithTimeout(targetUrl, ms = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(targetUrl, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}