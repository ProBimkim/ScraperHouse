'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Search, AlertTriangle, Zap } from 'lucide-react';

export default function Navbar({ errorCount = 0 }) {
  const pathname = usePathname();

  return (
    <nav className="navbar">
      <Link href="/" className="nav-brand" style={{ textDecoration: 'none' }}>
        <div className="nav-brand-icon">
          <Zap size={16} color="white" />
        </div>
        <span>FormScraper</span>
      </Link>

      <div className="nav-links">
        <Link href="/" className={`nav-link ${pathname === '/' ? 'active' : ''}`}>
          <Search size={16} />
          Scraping
        </Link>
        <Link href="/errors" className={`nav-link ${pathname === '/errors' ? 'active' : ''}`}>
          <AlertTriangle size={16} />
          Error Monitor
          {errorCount > 0 && <span className="nav-badge">{errorCount}</span>}
        </Link>
      </div>
    </nav>
  );
}
