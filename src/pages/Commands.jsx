import { useEffect, useRef } from 'react';
import CommandTable from '@/components/CommandTable';

export default function Commands() {
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section aria-labelledby="commands-heading" className="mx-auto max-w-4xl px-4 py-8">
      <h1 id="commands-heading" ref={headingRef} tabIndex={-1} className="text-3xl font-bold mb-2">
        Commands
      </h1>
      <p className="text-muted-foreground mb-6">
        GalCoy responds to the following commands via direct messages in TeamTalk5. Send a
        command letter to the bot to control playback, manage queues, and more.
      </p>
      <CommandTable />
    </section>
  );
}