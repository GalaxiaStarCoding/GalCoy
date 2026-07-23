import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

const INPUT_CLASS =
  'w-full rounded-lg border border-input bg-input px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-primary';

export default function BotNameStep({ initialData, onNext }) {
  const [name, setName] = useState(initialData.bot_name || '');
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) onNext({ bot_name: name.trim() });
  };

  return (
    <section aria-labelledby="bot-name-heading" className="glow-card rounded-xl bg-card p-6">
      <h1 id="bot-name-heading" ref={headingRef} tabIndex={-1} className="text-2xl font-bold mb-2">
        Name Your Bot
      </h1>
      <p className="text-muted-foreground mb-4">Enter a display name for your GalCoy bot.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="bot-name" className="block text-sm font-medium mb-1">
            Bot Name
          </label>
          <input
            id="bot-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={INPUT_CLASS}
            aria-required="true"
            placeholder="e.g. GalCoy"
          />
        </div>
        <Button type="submit" disabled={!name.trim()} className="w-full">
          Next
        </Button>
      </form>
    </section>
  );
}