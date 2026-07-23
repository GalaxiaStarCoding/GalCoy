import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Wifi } from 'lucide-react';

export default function SavedServers({ onConnect, onAddNew, refreshKey }) {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const headingRef = useRef(null);

  useEffect(() => {
    const fetchServers = async () => {
      setLoading(true);
      try {
        const result = await base44.entities.BotServer.list();
        setServers(result);
      } catch {
        setServers([]);
      }
      setLoading(false);
    };
    fetchServers();
  }, [refreshKey]);

  useEffect(() => {
    if (!loading) headingRef.current?.focus();
  }, [loading]);

  const handleDelete = async (id) => {
    await base44.entities.BotServer.delete(id);
    setServers((prev) => prev.filter((s) => s.id !== id));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div
          className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"
          aria-hidden="true"
        ></div>
        <span className="sr-only" role="status" aria-live="polite">
          Loading saved servers...
        </span>
      </div>
    );
  }

  return (
    <section aria-labelledby="servers-heading" className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 id="servers-heading" ref={headingRef} tabIndex={-1} className="text-2xl font-bold">
          Saved Servers
        </h1>
        <Button onClick={onAddNew}>
          <Plus className="w-4 h-4" aria-hidden="true" />
          Add New Server
        </Button>
      </div>

      {servers.length === 0 ? (
        <div className="glow-card rounded-xl bg-card p-8 text-center">
          <p className="text-muted-foreground mb-4">No saved servers yet.</p>
          <Button onClick={onAddNew}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add New Server
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {servers.map((server) => (
            <li
              key={server.id}
              className="glow-card rounded-xl bg-card p-4 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <h2 className="font-semibold truncate">{server.bot_name}</h2>
                <p className="text-sm text-muted-foreground font-mono truncate">
                  {server.domain}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  Channel: {server.channel_path}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" onClick={() => onConnect(server)}>
                  <Wifi className="w-4 h-4" aria-hidden="true" />
                  Connect
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDelete(server.id)}
                  aria-label={`Delete ${server.bot_name}`}
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}