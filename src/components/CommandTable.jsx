const COMMANDS = [
  { cmd: 'h', args: '', desc: 'Shows command help.' },
  { cmd: 'p', args: '[query]', desc: 'Plays tracks found for query. If no query, pauses/resumes.' },
  { cmd: 'u', args: '[url]', desc: 'Plays a stream/file from a direct URL.' },
  { cmd: 's', args: '', desc: 'Stops playback.' },
  { cmd: 'n', args: '', desc: 'Plays the next track.' },
  { cmd: 'b', args: '', desc: 'Plays the previous track.' },
  { cmd: 'v', args: '[0-100]', desc: 'Sets volume. No arg shows current volume.' },
  { cmd: 'sb', args: '[seconds]', desc: 'Seeks backward. Default step if no arg.' },
  { cmd: 'sf', args: '[seconds]', desc: 'Seeks forward. Default step if no arg.' },
  { cmd: 'c', args: '[number]', desc: 'Selects a track by number from search results.' },
  { cmd: 'm', args: '[mode]', desc: 'Sets playback mode: SingleTrack, RepeatTrack, TrackList, RepeatTrackList, Random.' },
  { cmd: 'sp', args: '[0.25-4]', desc: 'Sets playback speed.' },
  { cmd: 'sv', args: '[service]', desc: 'Switches service (e.g., sv yt, sv ytm).' },
  { cmd: 'f', args: '[+/-][num]', desc: 'Favorites management. f lists. f + adds current. f - removes. f [num] plays.' },
  { cmd: 'gl', args: '', desc: 'Gets a direct link to the current track.' },
  { cmd: 'dl', args: '', desc: 'Downloads current track and uploads to channel.' },
  { cmd: 'dlv', args: '', desc: 'Downloads current track as video and uploads it to channel.' },
  { cmd: 'dlp', args: '[url]', desc: 'Downloads all tracks from a playlist/album URL, zips them, and uploads to the channel.' },
  { cmd: 'aad', args: '[link]', desc: 'Adds a single link/URL to your custom download list.' },
  { cmd: 'ad', args: '[links]', desc: 'Adds multiple space-separated links to the download list.' },
  { cmd: 'ld', args: '', desc: 'Lists all links currently in the download list.' },
  { cmd: 'rd', args: '[number/link]', desc: 'Removes a link from the download list by its index or URL.' },
  { cmd: 'ldd', args: '[link]', desc: 'Downloads a link directly and uploads to the TeamTalk channel.' },
  { cmd: 'ads', args: '[1/2]', desc: 'Downloads list: Option 1 (Normal sequentially) or Option 2 (ZIP compressed).' },
  { cmd: 'adsc', args: '', desc: 'Toggles local download mode: saves files locally to the VPS instead of uploading.' },
  { cmd: 'r', args: '[number]', desc: 'Plays from Recents. r lists recents.' },
  { cmd: 'jc', args: '', desc: 'Makes the bot join your current channel.' },
  { cmd: 'qa', args: '[query]', desc: 'Adds a track to the queue.' },
  { cmd: 'ql', args: '', desc: 'Lists all tracks currently in the queue.' },
  { cmd: 'qr', args: '[number]', desc: 'Removes a specific track from the queue.' },
  { cmd: 'qc', args: '', desc: 'Clears the entire queue.' },
  { cmd: 'qs', args: '', desc: 'Skips current track and plays the next one from the queue.' },
  { cmd: 'sr', args: '[on/off]', desc: 'Toggles Search Results Mode. When active, p QUERY shows a numbered list instead of playing immediately.' },
  { cmd: 'sl', args: '[number]', desc: 'Selects and plays result NUMBER from the last sr search list.' },
  { cmd: 'slc', args: '[number]', desc: 'Sets how many results are shown in sr mode (default 5). No arg shows current count.' },
  { cmd: 'a', args: '', desc: 'Shows about info.' },
];

export default function CommandTable() {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          GalCoy Bot Commands — all available commands, their arguments, and descriptions
        </caption>
        <thead className="bg-muted/50">
          <tr>
            <th scope="col" className="text-left px-4 py-3 font-semibold border-b border-border">Command</th>
            <th scope="col" className="text-left px-4 py-3 font-semibold border-b border-border">Arguments</th>
            <th scope="col" className="text-left px-4 py-3 font-semibold border-b border-border">Description</th>
          </tr>
        </thead>
        <tbody>
          {COMMANDS.map((c, i) => (
            <tr key={c.cmd} className={i % 2 === 0 ? 'bg-card' : 'bg-muted/20'}>
              <th scope="row" className="px-4 py-3 text-left border-b border-border">
                <code className="font-mono font-bold text-primary">{c.cmd}</code>
              </th>
              <td className="px-4 py-3 border-b border-border">
                {c.args ? (
                  <code className="font-mono text-accent">{c.args}</code>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-3 border-b border-border">{c.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}