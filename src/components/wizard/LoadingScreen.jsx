import { useEffect, useRef } from 'react';

export default function LoadingScreen({ domain }) {
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section
      aria-live="polite"
      aria-label="Connection status"
      className="flex flex-col items-center justify-center min-h-[60vh] px-4"
    >
      <div className="relative mb-6" aria-hidden="true">
        <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      </div>
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-center">
        Now Loading, Please Wait...
      </h1>
      <p role="status" aria-live="polite" className="text-muted-foreground mt-2">
        Connecting to {domain ? <span className="font-mono text-foreground">{domain}</span> : 'server'}...
      </p>
    </section>
  );
}