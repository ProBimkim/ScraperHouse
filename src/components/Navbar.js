'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Search, AlertTriangle } from 'lucide-react';

export default function Navbar({ errorCount = 0 }) {
  const pathname = usePathname();

  return (
    <nav className="navbar">
      <Link href="/" className="nav-brand" style={{ textDecoration: 'none' }}>
        <div className="nav-brand-icon" style={{ background: 'transparent', padding: 0 }}>
          <Image src="/logo.png" alt="Logo" width={24} height={24} className="object-contain" />
        </div>
        <span>ScraperHouse</span>
      </Link>

      <div className="nav-links">
        <Link href="/" className={`nav-link ${pathname === '/' ? 'active' : ''}`}>
          Dashboard
        </Link>
        <Link href="/ms-forms" className={`nav-link ${pathname.startsWith('/ms-forms') ? 'active' : ''}`}>
          <Search size={16} />
          MS Forms
        </Link>
        <Link href="/quizizz" className={`nav-link ${pathname.startsWith('/quizizz') ? 'active' : ''}`}>
          <Search size={16} />
          Quizizz
        </Link>
        <Link href="/errors" className={`nav-link ${pathname.startsWith('/errors') ? 'active' : ''}`}>
          <AlertTriangle size={16} />
          Errors
          {errorCount > 0 && <span className="nav-badge">{errorCount}</span>}
        </Link>
      </div>
    </nav>
  );
}
