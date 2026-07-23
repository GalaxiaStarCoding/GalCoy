import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

export default function ChannelStep({ initialData, onConnect, onBack }) {
  const rawChannel = (initialData.channel_path || '').replace(/^\//, '');
  const [channel, setChannel] = useState(rawChannel);
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const path = '/' + channel.trim();
    onConnect({ channel_path: path });
  };

  return (
    <section aria-labelledby="channel-heading" className="glow-card rounded-xl bg-card p-6">
      <h1 id="channel-heading" ref={headingRef} tabIndex={-1} className="text-2xl font-bold mb-2">
        Select Channel
      </h1>
      <p className="text-muted-foreground mb-4">
        Enter the channel path for the bot to join.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="channel" className="block text-sm font-medium mb-1">
            Channel Path
          </label>
          <div className="flex">
            <span
              className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-input bg-muted text-muted-foreground font-mono"
              aria-hidden="true"
            >
              /
            </span>
            <input
              id="channel"
              type="text"
              required
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="w-full rounded-r-lg border border-input bg-input px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-primary"
              aria-describedby="channel-help"
              aria-required="true"
              placeholder="My Channel"
            />
          </div>
          <p id="channel-help" className="text-sm text-muted-foreground mt-1">
            Enter the channel name. The bot will join the path starting with /.
          </p>
        </div>
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={onBack} className="flex-1">
            Back
          </Button>
          <Button type="submit" className="flex-1">
            Connect
          </Button>
        </div>
      </form>
    </section>
  );
}