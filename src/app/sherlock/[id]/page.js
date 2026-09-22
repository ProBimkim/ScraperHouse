'use client';
import { useState, useEffect, useMemo, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  UserSearch,
  ExternalLink,
  Search,
  Download,
  Trash2,
  Loader2,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertCircle,
  AtSign,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import DeleteConfirmModal from '@/components/DeleteConfirmModal';
import styles from '../page.module.css';

export default function SherlockDetailPage({ params }) {
  const { id } = use(params);
  const router = useRouter();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [activeFilter, setActiveFilter] = useState('found');
  const [platformQuery, setPlatformQuery] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    fetchDetail();
  }, [id]);

  const fetchDetail = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sherlock/${id}`);
      if (!res.ok) {
        throw new Error('Hasil pencarian tidak ditemukan');
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleDeleteConfirm = async (password) => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/sherlock/${id}?password=${encodeURIComponent(password)}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/sherlock');
      } else {
        const errData = await res.json();
        showToast(errData.error || 'Gagal menghapus data. Pastikan password benar.', 'error');
        setIsDeleting(false);
        setShowDeleteModal(false);
      }
    } catch (err) {
      showToast(err.message, 'error');
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const handleExport = (format) => {
    if (!data || !data.results) return;
    const cleanUser = data.username || 'sherlock-results';

    if (format === 'txt') {
      const found = data.results.filter((r) => r.status === 'found');
      const lines = [
        `# Sherlock OSINT Hunt Results for: @${cleanUser}`,
        `# Total checked: ${data.results.length} | Found: ${found.length}`,
        `# Date: ${new Date(data.createdAt).toISOString()}`,
        '',
        ...found.map((r) => `${r.siteName}: ${r.url}`),
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      downloadBlob(blob, `sherlock_${cleanUser}.txt`);
    } else if (format === 'csv') {
      const headers = ['Site Name', 'Status', 'URL', 'Response Time (ms)', 'HTTP Status'];
      const rows = data.results.map((r) => [
        `"${r.siteName}"`,
        `"${r.status}"`,
        `"${r.url}"`,
        r.responseTime || 0,
        r.httpStatus || '',
      ]);
      const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
      downloadBlob(blob, `sherlock_${cleanUser}.csv`);
    } else if (format === 'json') {
      const blob = new Blob([JSON.stringify(data.results, null, 2)], { type: 'application/json;charset=utf-8' });
      downloadBlob(blob, `sherlock_${cleanUser}.json`);
    }
  };

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredResults = useMemo(() => {
    if (!data || !data.results) return [];
    return data.results.filter((item) => {
      if (activeFilter === 'found' && item.status !== 'found') return false;
      if (activeFilter === 'not_found' && item.status !== 'not_found') return false;
      if (activeFilter === 'error' && item.status !== 'error') return false;

      if (platformQuery) {
        const q = platformQuery.toLowerCase();
        return item.siteName.toLowerCase().includes(q) || item.url.toLowerCase().includes(q);
      }
      return true;
    });
  }, [data, activeFilter, platformQuery]);

  if (loading) {
    return (
      <>
        <Navbar />
        <div className={styles.container} style={{ textAlign: 'center', padding: '100px 20px' }}>
          <Loader2 size={40} className="spin" color="#34d399" style={{ margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--text-muted)' }}>Memuat detail pencarian Sherlock...</p>
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <Navbar />
        <div className={styles.container} style={{ textAlign: 'center', padding: '100px 20px' }}>
          <AlertCircle size={48} color="var(--error)" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ marginBottom: '8px' }}>Pencarian Tidak Ditemukan</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>{error || 'Data tidak tersedia.'}</p>
          <Link href="/sherlock" className="btn btn-primary" style={{ borderRadius: '999px' }}>
            <ArrowLeft size={16} /> Kembali ke Sherlock
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />

      <div className={styles.container}>
        {/* Toast */}
        {toast && (
          <div
            style={{
              position: 'fixed',
              top: '24px',
              right: '24px',
              zIndex: 9999,
              padding: '12px 24px',
              borderRadius: '999px',
              background: toast.type === 'error' ? 'rgba(239, 68, 68, 0.95)' : 'rgba(16, 185, 129, 0.95)',
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.9rem',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
              border: '1px solid rgba(255,255,255,0.2)',
            }}
          >
            {toast.msg}
          </div>
        )}

        {/* Top Navigation Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <Link
            href="/sherlock"
            className="btn btn-ghost btn-sm"
            style={{ borderRadius: '999px', padding: '8px 16px', gap: '8px' }}
          >
            <ArrowLeft size={16} /> Kembali ke Sherlock
          </Link>

          <button
            type="button"
            className="btn-icon"
            onClick={() => setShowDeleteModal(true)}
            title="Hapus riwayat pencarian ini"
          >
            <Trash2 size={16} />
          </button>
        </div>

        {/* Header Summary Card */}
        <div className={styles.searchCard}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <AtSign size={24} color="#34d399" />
                <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                  {data.username}
                </h1>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: '999px',
                    background: 'rgba(52, 211, 153, 0.15)',
                    color: '#34d399',
                    border: '1px solid rgba(52, 211, 153, 0.3)',
                  }}
                >
                  {data.mode === 'all' ? 'Deep Scan' : 'Quick Scan'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Calendar size={14} />
                  {new Date(data.createdAt).toLocaleDateString('id-ID', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
            </div>

            {/* Export Buttons */}
            <div className={styles.exportButtons}>
              <button
                type="button"
                className={styles.btnExport}
                onClick={() => handleExport('txt')}
                title="Export found URLs as TXT"
              >
                <Download size={13} /> TXT
              </button>
              <button
                type="button"
                className={styles.btnExport}
                onClick={() => handleExport('csv')}
                title="Export results table as CSV"
              >
                <Download size={13} /> CSV
              </button>
              <button
                type="button"
                className={styles.btnExport}
                onClick={() => handleExport('json')}
                title="Export raw JSON"
              >
                <Download size={13} /> JSON
              </button>
            </div>
          </div>
        </div>

        {/* Results Section */}
        <div className={styles.statusSection}>
          {/* Stat Capsules */}
          <div className={styles.statsGrid}>
            <div className={`${styles.statCapsule} ${styles.statCapsuleFound}`}>
              <span className={styles.statValue}>{data.foundCount || 0}</span>
              <span className={styles.statLabel}>Found ✓</span>
            </div>

            <div className={styles.statCapsule}>
              <span className={styles.statValue}>{data.notFoundCount || 0}</span>
              <span className={styles.statLabel}>Not Found ✗</span>
            </div>

            <div className={styles.statCapsule}>
              <span className={styles.statValue}>{data.errorCount || 0}</span>
              <span className={styles.statLabel}>Errors</span>
            </div>

            <div className={styles.statCapsule}>
              <span className={styles.statValue}>{data.totalSites || 0}</span>
              <span className={styles.statLabel}>Total Sites Checked</span>
            </div>
          </div>

          {/* Control Row: Filters & Search */}
          <div className={styles.controlRow}>
            <div className={styles.filterTabs}>
              <button
                type="button"
                className={`${styles.filterTab} ${activeFilter === 'found' ? styles.filterTabActiveFound : ''}`}
                onClick={() => setActiveFilter('found')}
              >
                <CheckCircle2 size={14} />
                Found
                <span className={styles.tabBadge}>{data.foundCount || 0}</span>
              </button>

              <button
                type="button"
                className={`${styles.filterTab} ${activeFilter === 'all' ? styles.filterTabActive : ''}`}
                onClick={() => setActiveFilter('all')}
              >
                All Checked
                <span className={styles.tabBadge}>{data.results ? data.results.length : 0}</span>
              </button>

              <button
                type="button"
                className={`${styles.filterTab} ${activeFilter === 'not_found' ? styles.filterTabActive : ''}`}
                onClick={() => setActiveFilter('not_found')}
              >
                <XCircle size={14} />
                Not Found
                <span className={styles.tabBadge}>{data.notFoundCount || 0}</span>
              </button>

              {data.errorCount > 0 && (
                <button
                  type="button"
                  className={`${styles.filterTab} ${activeFilter === 'error' ? styles.filterTabActive : ''}`}
                  onClick={() => setActiveFilter('error')}
                >
                  <AlertCircle size={14} />
                  Errors
                  <span className={styles.tabBadge}>{data.errorCount || 0}</span>
                </button>
              )}
            </div>

            <div style={{ position: 'relative', minWidth: '220px' }}>
              <Search
                size={16}
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
              />
              <input
                type="text"
                placeholder="Filter platforms..."
                value={platformQuery}
                onChange={(e) => setPlatformQuery(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(10, 14, 26, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '999px',
                  padding: '8px 12px 8px 36px',
                  fontSize: '0.85rem',
                  color: 'var(--text-main)',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Result Cards Grid */}
          {filteredResults.length === 0 ? (
            <div className={styles.emptyState}>
              Tidak ada platform yang cocok dengan filter yang dipilih.
            </div>
          ) : (
            <div className={styles.resultsGrid}>
              {filteredResults.map((item, idx) => (
                <div
                  key={`${item.siteName}-${idx}`}
                  className={`${styles.resultCard} ${
                    item.status === 'found'
                      ? styles.resultCardFound
                      : item.status === 'not_found'
                      ? styles.resultCardNotFound
                      : ''
                  }`}
                >
                  <div className={styles.resultHeader}>
                    <div className={styles.siteName}>{item.siteName}</div>
                    <span
                      className={`${styles.statusPill} ${
                        item.status === 'found'
                          ? styles.statusPillFound
                          : item.status === 'not_found'
                          ? styles.statusPillNotFound
                          : styles.statusPillError
                      }`}
                    >
                      {item.status === 'found' ? 'FOUND ✓' : item.status === 'not_found' ? 'NOT FOUND' : 'ERROR'}
                    </span>
                  </div>

                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.resultUrl}
                    title={item.url}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.url}
                    </span>
                    <ExternalLink size={14} style={{ flexShrink: 0 }} />
                  </a>

                  <div className={styles.resultFooter}>
                    <span>
                      {item.httpStatus ? `HTTP ${item.httpStatus}` : item.errorMsg || 'Completed'}
                    </span>
                    <span>{item.responseTime ? `${item.responseTime}ms` : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteConfirm}
        isDeleting={isDeleting}
        item={data}
      />
    </>
  );
}
