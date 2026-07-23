import { useEffect, useRef, useState } from 'react';
import BotStatus from '@/components/BotStatus';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Power, VolumeX, Volume2, Settings2, Radio, Play, Square } from 'lucide-react';
import { STATUS_URL, UNMUTE_URL, START_STREAM_URL, STOP_STREAM_URL } from '@/lib/proxyConfig';

export default function ConnectedScreen({
  server,
  connectionData,
  onDisconnect,
  isMuted,
  onSetMuted,
  onOpenSoundPanel,
  audioDeviceId,
}) {
  const [botStatus, setBotStatus] = useState({ status: 'idle', stationName: '', songName: '' });
  const [streamUrl, setStreamUrl] = useState('');
  const [startingStream, setStartingStream] = useState(false);

  useEffect(() => {
    const sessionId = connectionData?.sessionId;
    if (!sessionId) return;

    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`${STATUS_URL}?sessionId=${encodeURIComponent(sessionId)}`);
        const data = await res.json();
        if (active && data.botStatus) setBotStatus(data.botStatus);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => { active = false; clearInterval(interval); };
  }, [connectionData?.sessionId]);

  const audioRef = useRef(null);
  const lastStreamUrl = useRef(null);

  // Auto-unmute when stream starts playing
  useEffect(() => {
    if (botStatus.status === 'playing') {
      onSetMuted(false);
    }
  }, [botStatus.status, onSetMuted]);

  // Tell the bot to unmute (update its TeamTalk5 status) when the stream starts playing
  useEffect(() => {
    const sessionId = connectionData?.sessionId;
    if (botStatus.status === 'playing' && sessionId) {
      fetch(UNMUTE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      }).catch(() => {});
    }
  }, [botStatus.status, connectionData?.sessionId]);

  const handleStartStream = async () => {
    if (!streamUrl.trim() || !connectionData?.sessionId) return;
    setStartingStream(true);
    try {
      await fetch(START_STREAM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: connectionData.sessionId, streamUrl: streamUrl.trim() }),
      });
    } catch {}
    setStartingStream(false);
  };

  const handleStopStream = async () => {
    if (!connectionData?.sessionId) return;
    try {
      await fetch(STOP_STREAM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: connectionData.sessionId }),
      });
    } catch {}
  };

  // Play/pause audio based on status and mute
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const streamUrl = botStatus.streamUrl;
    const shouldPlay = botStatus.status === 'playing' && streamUrl && !isMuted;

    if (streamUrl && streamUrl !== lastStreamUrl.current) {
      lastStreamUrl.current = streamUrl;
      audio.src = streamUrl;
    }

    if (shouldPlay) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [botStatus.status, botStatus.streamUrl, isMuted]);

  // Route audio to selected VAC device
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioDeviceId) return;
    if (audio.setSinkId) {
      audio.setSinkId(audioDeviceId).catch(() => {});
    }
  }, [audioDeviceId]);

  return (
    <section aria-labelledby="connected-heading" className="mx-auto max-w-xl px-4 py-8">
      <div className="glow-card rounded-xl bg-card p-6 space-y-6">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3" aria-hidden="true">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-accent"></span>
          </span>
          <span className="text-sm font-medium text-accent">Connected</span>
        </div>

        <div>
          <h1 id="connected-heading" className="text-3xl font-bold tracking-tight">
            {server.bot_name || 'GalCoy'}
          </h1>
          <p className="text-muted-foreground mt-1">
            Server: <span className="font-mono text-foreground">{server.domain}</span>
          </p>
          {connectionData?.serverName && (
            <p className="text-muted-foreground mt-1">
              Server Name: <span className="text-foreground">{connectionData.serverName}</span>
            </p>
          )}
          <p className="text-muted-foreground mt-1">
            Channel: <span className="font-mono text-foreground">{connectionData?.channelName || server.channel_path}</span>
          </p>
          {connectionData?.userCount !== undefined && (
            <p className="text-muted-foreground mt-1 flex items-center gap-1">
              <Radio className="w-4 h-4" aria-hidden="true" />
              {connectionData.userCount} user{connectionData.userCount !== 1 ? 's' : ''} on server
            </p>
          )}
        </div>

        {connectionData?.motd && (
          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Message of the Day
            </p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{connectionData.motd}</p>
          </div>
        )}

        <BotStatus status={botStatus.status} stationName={botStatus.stationName} songName={botStatus.songName} />

        <div className="space-y-2">
          <label htmlFor="stream-url" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Stream URL
          </label>
          {botStatus.status === 'playing' || botStatus.status === 'loading' ? (
            <Button variant="outline" className="w-full" onClick={handleStopStream}>
              <Square className="w-4 h-4" aria-hidden="true" />
              Stop Stream
            </Button>
          ) : (
            <div className="flex gap-2">
              <Input
                id="stream-url"
                type="url"
                placeholder="https://stream.example.com/listen"
                value={streamUrl}
                onChange={(e) => setStreamUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleStartStream(); }}
              />
              <Button onClick={handleStartStream} disabled={startingStream || !streamUrl.trim()}>
                <Play className="w-4 h-4" aria-hidden="true" />
                {startingStream ? 'Loading…' : 'Play'}
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Button variant="secondary" className="w-full" onClick={onOpenSoundPanel}>
            <Settings2 className="w-4 h-4" aria-hidden="true" />
            Sound System
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="destructive" onClick={onDisconnect}>
              <Power className="w-4 h-4" aria-hidden="true" />
              Disconnect The Bot
            </Button>
            <Button
              variant="outline"
              onClick={() => onSetMuted(!isMuted)}
              aria-pressed={isMuted}
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Volume2 className="w-4 h-4" aria-hidden="true" />
              )}
              {isMuted ? 'Unmute Site' : 'Mute Site'}
            </Button>
          </div>
        </div>
      </div>
      <audio ref={audioRef} hidden />
    </section>
  );
}