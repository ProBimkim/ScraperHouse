'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import {
  UserSearch,
  ExternalLink,
  Search,
  Download,
  Trash2,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  SlidersHorizontal,
  AtSign,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import DeleteConfirmModal from '@/components/DeleteConfirmModal';
import styles from './page.module.css';

export default function SherlockPage() {
  const [username, setUsername] = useState('');
  const [scanMode, setScanMode] = useState('popular'); // 'popular' | 'all'
  const [isHunting, setIsHunting] = useState(false);
  const [currentSearch, setCurrentSearch] = useState(null);
  const [liveResults, setLiveResults] = useState([]);
  const [progress, setProgress] = useState({ checked: 0, total: 0, foundCount: 0, notFoundCount: 0, errorCount: 0 });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  
  // Filtering & Search in results
  const [activeFilter, setActiveFilter] = useState('found'); // 'found' | 'all' | 'not_found' | 'error'
  const [platformQuery, setPlatformQuery] = useState('');

  // History & deletion
  const [history, setHistory] = useState([]);
  const [errorCount, setErrorCount] = useState(0);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState(null);

  const timerRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Fetch initial history and error logs count
  useEffect(() => {
    fetchHistory();
    fetchErrorCount();
  }, []);

  // Timer effect during hunting
  useEffect(() => {
    if (isHunting) {
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isHunting]);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/sherlock/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(Array.isArray(data) ? data : []);
      }
    } catch {}
  };

  const fetchErrorCount = async () => {
    try {
      const res = await fetch('/api/errors');
      if (res.ok) {
        const data = await res.json();
        setErrorCount(Array.isArray(data) ? data.length : 0);
      }
    } catch {}
  };

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleStartHunt = async (e) => {
    if (e) e.preventDefault();
    const cleanUser = username.trim();
    if (!cleanUser) return;

    if (isHunting) return;

    setIsHunting(true);
    setLiveResults([]);
    setProgress({ checked: 0, total: scanMode === 'popular' ? 50 : 482, foundCount: 0, notFoundCount: 0, errorCount: 0 });
    setActiveFilter('found');
    setPlatformQuery('');

    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch('/api/sherlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUser, mode: scanMode }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'start') {
                setCurrentSearch({
                  id: data.id,
                  slug: data.slug,
                  username: data.username,
                  mode: data.mode,
                });
                setProgress((prev) => ({ ...prev, total: data.totalSites }));
              } else if (data.type === 'result') {
                setLiveResults((prev) => [data.item, ...prev]);
                if (data.progress) {
                  setProgress(data.progress);
                }
              } else if (data.type === 'complete') {
                fetchHistory();
                showToast(`Hunting completed! Found ${data.summary.foundCount} profiles.`, 'success');
              } else if (data.type === 'error') {
                showToast(data.message || 'Error occurred during hunting', 'error');
              }
            } catch (err) {
              console.error('SSE parse error:', err);
            }
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        showToast(err.message || 'Failed to hunt username', 'error');
      }
    } finally {
      setIsHunting(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopHunt = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsHunting(false);
    showToast('Hunt stopped by user.', 'info');
  };

  // Delete search item
  const promptDelete = (e, item) => {
    e.stopPropagation();
    setItemToDelete(item);
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      const id = itemToDelete.slug || itemToDelete._id;
      const res = await fetch(`/api/sherlock/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setHistory((prev) => prev.filter((h) => h.slug !== itemToDelete.slug && h._id !== itemToDelete._id));
        if (currentSearch && (currentSearch.slug === itemToDelete.slug || currentSearch.id === itemToDelete._id)) {
          setLiveResults([]);
          setCurrentSearch(null);
        }
        showToast('Hasil pencarian berhasil dihapus.', 'success');
      } else {
        const data = await res.json();
        showToast(data.error || 'Gagal menghapus hasil pencarian.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Gagal menghapus hasil pencarian.', 'error');
    } finally {
      setIsDeleting(false);
      setItemToDelete(null);
    }
  };

  // Export functions
  const handleExport = (format) => {
    if (!liveResults.length) return;
    const cleanUser = username.trim() || 'sherlock-results';

    if (format === 'txt') {
      const found = liveResults.filter((r) => r.status === 'found');
      const lines = [
        `# Sherlock OSINT Hunt Results for: @${cleanUser}`,
        `# Total checked: ${liveResults.length} | Found: ${found.length}`,
        `# Date: ${new Date().toISOString()}`,
        '',
        ...found.map((r) => `${r.siteName}: ${r.url}`),
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      downloadBlob(blob, `sherlock_${cleanUser}.txt`);
    } else if (format === 'csv') {
      const headers = ['Site Name', 'Status', 'URL', 'Response Time (ms)', 'HTTP Status'];
      const rows = liveResults.map((r) => [
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
      const blob = new Blob([JSON.stringify(liveResults, null, 2)], { type: 'application/json;charset=utf-8' });
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

  // Filtered & searched results
  const filteredResults = useMemo(() => {
    return liveResults.filter((item) => {
      if (activeFilter === 'found' && item.status !== 'found') return false;
      if (activeFilter === 'not_found' && item.status !== 'not_found') return false;
      if (activeFilter === 'error' && item.status !== 'error') return false;

      if (platformQuery) {
        const q = platformQuery.toLowerCase();
        return item.siteName.toLowerCase().includes(q) || item.url.toLowerCase().includes(q);
      }
      return true;
    });
  }, [liveResults, activeFilter, platformQuery]);

  const progressPercent = progress.total > 0 ? Math.min(100, Math.round((progress.checked / progress.total) * 100)) : 0;

  return (
    <>
      <Navbar errorCount={errorCount} />

      <div className={styles.container}>
        {/* Toast Notification */}
        {toast && (
          <div
            style={{
              position: 'fixed',
              top: '24px',
              right: '24px',
              zIndex: 9999,
              padding: '12px 24px',
              borderRadius: '999px',
              background: toast.type === 'error' ? 'rgba(239, 68, 68, 0.95)' : toast.type === 'success' ? 'rgba(16, 185, 129, 0.95)' : 'rgba(59, 130, 246, 0.95)',
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.9rem',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
              border: '1px solid rgba(255,255,255,0.2)',
              animation: 'fadeIn 0.3s ease',
            }}
          >
            {toast.msg}
          </div>
        )}

        {/* Header Title */}
        <div className={styles.header}>
          <h1 className={styles.title}>
            <UserSearch size={38} color="#34d399" />
            Sherlock OSINT
          </h1>
          <p className={styles.subtitle}>
            Hunt social media accounts and public digital footprints across 400+ platforms in real-time.
          </p>
        </div>

        {/* Search & Configuration Card */}
        <div className={styles.searchCard}>
          <form onSubmit={handleStartHunt}>
            <div className={styles.inputWrapper}>
              <div className={styles.prefixIcon}>
                <AtSign size={20} />
              </div>
              <input
                type="text"
                className={styles.inputField}
                placeholder="Enter target username (e.g. torvalds, elonmusk, satoshi)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isHunting}
                required
              />
              {isHunting ? (
                <button
                  type="button"
                  onClick={handleStopHunt}
                  className="btn btn-error btn-sm"
                  style={{ borderRadius: '999px', padding: '10px 20px' }}
                >
                  <XCircle size={16} /> Stop Hunt
                </button>
              ) : (
                <button
                  type="submit"
                  className={styles.btnLiquidHunt}
                  disabled={!username.trim() || isHunting}
                >
                  <UserSearch size={18} />
                  Start Hunt
                </button>
              )}
            </div>

            {/* Scan Mode Switcher */}
            <div className={styles.modeRow}>
              <div className={styles.modeToggles}>
                <button
                  type="button"
                  className={`${styles.modePill} ${scanMode === 'popular' ? styles.modePillActive : ''}`}
                  onClick={() => setScanMode('popular')}
                  disabled={isHunting}
                >
                  ⚡ Quick Scan (50 Popular)
                </button>
                <button
                  type="button"
                  className={`${styles.modePill} ${scanMode === 'all' ? styles.modePillActive : ''}`}
                  onClick={() => setScanMode('all')}
                  disabled={isHunting}
                >
                  🌐 Deep Scan (480+ All Platforms)
                </button>
              </div>
              <span className={styles.scanHint}>
                {scanMode === 'popular'
                  ? 'Checks top 50 networks (GitHub, Twitter, Instagram, Reddit, etc.) in ~5-10s'
                  : 'Exhaustive check across all 482 global platforms (~25-40s)'}
              </span>
            </div>
          </form>
        </div>

        {/* Real-time Status Section (Visible if hunting or results exist) */}
        {(isHunting || liveResults.length > 0) && (
          <div className={styles.statusSection}>
            {/* Progress Bar Capsule */}
            <div className={styles.progressBarContainer}>
              <div
                className={styles.progressBarFill}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Live Stat Capsules */}
            <div className={styles.statsGrid}>
              <div className={`${styles.statCapsule} ${styles.statCapsuleFound}`}>
                <span className={styles.statValue}>{progress.foundCount}</span>
                <span className={styles.statLabel}>Found ✓</span>
              </div>

              <div className={styles.statCapsule}>
                <span className={styles.statValue}>{progress.notFoundCount}</span>
                <span className={styles.statLabel}>Not Found ✗</span>
              </div>

              <div className={styles.statCapsule}>
                <span className={styles.statValue}>{progress.errorCount}</span>
                <span className={styles.statLabel}>Errors / Blocked</span>
              </div>

              <div className={styles.statCapsule}>
                <span className={styles.statValue}>
                  {progress.checked} / {progress.total}
                </span>
                <span className={styles.statLabel}>Progress ({progressPercent}%)</span>
              </div>

              <div className={styles.statCapsule}>
                <span className={styles.statValue} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={18} color="var(--text-muted)" /> {elapsedSeconds}s
                </span>
                <span className={styles.statLabel}>Elapsed Time</span>
              </div>
            </div>

            {/* Control Row: Filters + Search + Export */}
            <div className={styles.controlRow}>
              {/* Filter Tabs */}
              <div className={styles.filterTabs}>
                <button
                  type="button"
                  className={`${styles.filterTab} ${activeFilter === 'found' ? styles.filterTabActiveFound : ''}`}
                  onClick={() => setActiveFilter('found')}
                >
                  <CheckCircle2 size={14} />
                  Found
                  <span className={styles.tabBadge}>{progress.foundCount}</span>
                </button>

                <button
                  type="button"
                  className={`${styles.filterTab} ${activeFilter === 'all' ? styles.filterTabActive : ''}`}
                  onClick={() => setActiveFilter('all')}
                >
                  All Checked
                  <span className={styles.tabBadge}>{liveResults.length}</span>
                </button>

                <button
                  type="button"
                  className={`${styles.filterTab} ${activeFilter === 'not_found' ? styles.filterTabActive : ''}`}
                  onClick={() => setActiveFilter('not_found')}
                >
                  <XCircle size={14} />
                  Not Found
                  <span className={styles.tabBadge}>{progress.notFoundCount}</span>
                </button>

                {progress.errorCount > 0 && (
                  <button
                    type="button"
                    className={`${styles.filterTab} ${activeFilter === 'error' ? styles.filterTabActive : ''}`}
                    onClick={() => setActiveFilter('error')}
                  >
                    <AlertCircle size={14} />
                    Errors
                    <span className={styles.tabBadge}>{progress.errorCount}</span>
                  </button>
                )}
              </div>

              {/* Search Inside Results */}
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

            {/* Results Grid */}
            {filteredResults.length === 0 ? (
              <div className={styles.emptyState}>
                {isHunting ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                    <Loader2 size={28} className="spin" color="#34d399" />
                    <span>Hunting profiles across platforms...</span>
                  </div>
                ) : (
                  <span>No platforms matched the current filter.</span>
                )}
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
        )}

        {/* History Section */}
        <div className={styles.historySection}>
          <h2 className={styles.sectionTitle}>
            <Clock size={22} color="#34d399" />
            Recent Sherlock Hunts
          </h2>

          {history.length === 0 ? (
            <div className={styles.emptyState}>
              Belum ada riwayat pencarian username. Masukkan username di atas untuk memulai pencarian.
            </div>
          ) : (
            <div className={styles.historyGrid}>
              {history.map((item) => (
                <div key={item.slug || item._id} className={styles.historyCard}>
                  <div className={styles.historyHeader}>
                    <div className={styles.historyUsername}>@{item.username}</div>
                    <span className={styles.historyDate}>
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : ''}
                    </span>
                  </div>

                  <div className={styles.historyStats}>
                    <span className={`${styles.historyBadge} ${styles.historyBadgeFound}`}>
                      {item.foundCount || 0} Found
                    </span>
                    <span className={`${styles.historyBadge} ${styles.historyBadgeTotal}`}>
                      {item.totalSites || 0} Sites ({item.mode === 'all' ? 'Deep' : 'Quick'})
                    </span>
                  </div>

                  <div className={styles.historyActions}>
                    <Link
                      href={`/sherlock/${item.slug || item._id}`}
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '6px 14px', fontSize: '0.82rem', gap: '6px' }}
                    >
                      View Details <ArrowRight size={13} />
                    </Link>

                    <button
                      type="button"
                      className="btn-icon"
                      onClick={(e) => promptDelete(e, item)}
                      title="Hapus riwayat pencarian"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Reusable Liquid Capsule Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        onConfirm={handleDeleteConfirm}
        isDeleting={isDeleting}
        item={itemToDelete}
      />
    </>
  );
}
