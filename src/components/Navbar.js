'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ShieldAlert, LogOut } from 'lucide-react';

export default function Navbar({ errorCount = 0 }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // abaikan: cookie tetap dihapus oleh server
    }
    router.push('/login');
    router.refresh();
  };

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
        <Link href="/strix" className={`nav-link ${pathname.startsWith('/strix') ? 'active' : ''}`}>
          <ShieldAlert size={16} />
          Pentest
        </Link>
        <Link href="/errors" className={`nav-link ${pathname.startsWith('/errors') ? 'active' : ''}`}>
          <AlertTriangle size={16} />
          Errors
          {errorCount > 0 && <span className="nav-badge">{errorCount}</span>}
        </Link>
      </div>

      <button type="button" onClick={handleLogout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
        <LogOut size={16} />
        Keluar
      </button>
    </nav>
  );
}
