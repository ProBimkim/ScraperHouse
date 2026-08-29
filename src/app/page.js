'use client';
import Link from 'next/link';
import { FormInput, AlertTriangle, ArrowRight } from 'lucide-react';
import Navbar from '@/components/Navbar';
import styles from './page.module.css';
import { useEffect, useState } from 'react';

export default function Dashboard() {
  const [errorCount, setErrorCount] = useState(0);

  useEffect(() => {
    fetch('/api/errors')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setErrorCount(data.length);
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <Navbar errorCount={errorCount} />
      <div className="container">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '20px', marginBottom: '16px' }}>
          <img 
            src="/logo.png" 
            alt="ScraperHouse Logo" 
            style={{ 
              width: '100%', 
              maxWidth: '300px', 
              height: 'auto',
              marginBottom: '16px' 
            }} 
          />
          <h1 className="page-title" style={{ textAlign: 'center', margin: 0 }}>
            ScraperHouse
          </h1>
        </div>
        <p className="page-subtitle" style={{ textAlign: 'center', marginBottom: '48px' }}>
          Welcome to the central dashboard for data extraction tools and monitoring.
        </p>

        <div className={styles.dashboardGrid}>
          {/* MS Forms Scraper */}
          <Link href="/ms-forms" className={styles.dashboardCard}>
            <div className={styles.cardIconWrapper} style={{ background: 'rgba(124, 108, 240, 0.15)', color: 'var(--primary)' }}>
              <FormInput size={32} />
            </div>
            <h2 className={styles.cardTitle}>Microsoft Forms</h2>
            <p className={styles.cardDesc}>
              Extract questions, structure, and media from public MS Forms links safely and efficiently.
            </p>
            <div className={styles.cardAction}>
              Open Scraper <ArrowRight size={16} />
            </div>
          </Link>

          {/* Error Monitor */}
          <Link href="/errors" className={styles.dashboardCard}>
            <div className={styles.cardIconWrapper} style={{ background: 'rgba(255, 107, 122, 0.15)', color: 'var(--error)' }}>
              <AlertTriangle size={32} />
              {errorCount > 0 && <span className={styles.badgePulse}>{errorCount}</span>}
            </div>
            <h2 className={styles.cardTitle}>Error Monitor</h2>
            <p className={styles.cardDesc}>
              Centralized logging and auto-debugging dashboard for all scraper operations.
            </p>
            <div className={styles.cardAction}>
              View Logs <ArrowRight size={16} />
            </div>
          </Link>
        </div>
      </div>
    </>
  );
}
