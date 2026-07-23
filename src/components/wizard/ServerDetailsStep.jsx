import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

const INPUT_CLASS =
  'w-full rounded-lg border border-input bg-input px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-primary';

export default function ServerDetailsStep({ initialData, onNext, onBack }) {
  const [domain, setDomain] = useState(initialData.domain || '');
  const [tcpPort, setTcpPort] = useState(initialData.tcp_port || 10333);
  const [udpPort, setUdpPort] = useState(initialData.udp_port || 10333);
  const [username, setUsername] = useState(initialData.username || '');
  const [password, setPassword] = useState(initialData.password || '');
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    onNext({
      domain: domain.trim(),
      tcp_port: Number(tcpPort),
      udp_port: Number(udpPort),
      username: username.trim(),
      password,
    });
  };

  return (
    <section aria-labelledby="server-heading" className="glow-card rounded-xl bg-card p-6">
      <h1 id="server-heading" ref={headingRef} tabIndex={-1} className="text-2xl font-bold mb-2">
        Server Details
      </h1>
      <p className="text-muted-foreground mb-4">
        Enter your TeamTalk5 server connection information.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="domain" className="block text-sm font-medium mb-1">
            Domain Name
          </label>
          <input
            id="domain"
            type="text"
            required
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className={INPUT_CLASS}
            aria-required="true"
            placeholder="e.g. myserver.com"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="tcp-port" className="block text-sm font-medium mb-1">
              TCP Port
            </label>
            <input
              id="tcp-port"
              type="number"
              min="1"
              max="65535"
              required
              value={tcpPort}
              onChange={(e) => setTcpPort(e.target.value)}
              className={INPUT_CLASS}
              aria-required="true"
            />
          </div>
          <div>
            <label htmlFor="udp-port" className="block text-sm font-medium mb-1">
              UDP Port
            </label>
            <input
              id="udp-port"
              type="number"
              min="1"
              max="65535"
              required
              value={udpPort}
              onChange={(e) => setUdpPort(e.target.value)}
              className={INPUT_CLASS}
              aria-required="true"
            />
          </div>
        </div>
        <div>
          <label htmlFor="username" className="block text-sm font-medium mb-1">
            Username
          </label>
          <input
            id="username"
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={INPUT_CLASS}
            aria-required="true"
            placeholder="Bot account username"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={INPUT_CLASS}
            aria-required="true"
            placeholder="Bot account password"
          />
        </div>
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={onBack} className="flex-1">
            Back
          </Button>
          <Button type="submit" className="flex-1">
            Next
          </Button>
        </div>
      </form>
    </section>
  );
}