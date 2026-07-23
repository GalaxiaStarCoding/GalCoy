export default function BotStatus({ status, stationName, songName }) {
  let message;
  if (status === 'playing') {
    message = stationName
      ? `Now Playing On ${stationName}: ${songName || 'Unknown'}`
      : `Now Playing: ${songName || 'Unknown'}`;
  } else if (status === 'loading') {
    message = 'Loading stream...';
  } else {
    message = 'Type "h" for further information';
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-lg border border-border bg-muted/50 px-4 py-3"
    >
      <p className="text-sm font-mono">{message}</p>
    </div>
  );
}