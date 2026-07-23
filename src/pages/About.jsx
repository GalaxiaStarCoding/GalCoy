import { useEffect, useRef } from 'react';

export default function About() {
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section aria-labelledby="about-heading" className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <div>
        <h1 id="about-heading" ref={headingRef} tabIndex={-1} className="text-3xl font-bold mb-2">
          About GalCoy
        </h1>
        <p className="text-muted-foreground">
          GalCoy is a TeamTalk5 media bot — your personal version of Paracoy. It joins TeamTalk5
          servers, plays music and live radio streams, manages queues, handles downloads, and
          responds to simple letter-based commands sent via direct messages.
        </p>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-2">How It Works</h2>
        <p className="text-muted-foreground">
          When GalCoy joins a channel, it stays muted until someone sends it a command. To play a
          stream, send the bot a direct message with the command{' '}
          <code className="font-mono text-primary">u</code> followed by a URL. The bot will reply
          "Now Loading, Please Wait..." and then "Now Playing: [name]" once the stream starts.
        </p>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-2">AzuraCast Support</h2>
        <p className="text-muted-foreground">
          When playing an AzuraCast MP3 stream, GalCoy displays rich metadata in its status,
          showing "Now Playing On [Station Name]: [Song Name]" so everyone knows what's currently
          playing.
        </p>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-2">Getting Started</h2>
        <ol className="list-decimal list-inside text-muted-foreground space-y-1">
          <li>Click "Add New Server" on the home page</li>
          <li>Enter a name for your bot</li>
          <li>Enter your TeamTalk5 server details (domain, ports, username, password)</li>
          <li>Choose the channel for the bot to join</li>
          <li>Wait for the bot to connect</li>
          <li>Send commands to the bot via direct messages in TeamTalk5</li>
        </ol>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-2">Inspiration</h2>
        <p className="text-muted-foreground">
          GalCoy is inspired by Paracoy, a TeamTalk5 media bot. GalCoy is built with accessibility
          in mind — fully compatible with NVDA screen readers.
        </p>
      </div>
    </section>
  );
}