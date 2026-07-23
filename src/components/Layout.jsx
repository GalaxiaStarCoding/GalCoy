import { Outlet, Link, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', label: 'Home' },
  { to: '/commands', label: 'Commands' },
  { to: '/about', label: 'About' },
];

export default function Layout() {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md"
      >
        Skip to main content
      </a>
      <header className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-40">
        <nav aria-label="Main navigation" className="mx-auto max-w-4xl flex h-16 items-center justify-between px-4">
          <Link to="/" className="text-xl font-bold tracking-tight" aria-label="GalCoy home">
            <span className="text-primary">Gal</span><span className="text-accent">Coy</span>
          </Link>
          <ul className="flex gap-4 sm:gap-6">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  aria-current={pathname === item.to ? 'page' : undefined}
                  className={`text-sm font-medium transition-colors hover:text-primary ${
                    pathname === item.to ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet />
      </main>
      <footer className="border-t border-border py-4 px-4 text-center text-sm text-muted-foreground">
        <p>GalCoy — A TeamTalk5 Media Bot</p>
      </footer>
    </div>
  );
}