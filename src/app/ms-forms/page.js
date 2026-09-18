'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ChevronRight, Loader2, Clock, CheckCircle, Trash2 } from 'lucide-react';
import Navbar from '@/components/Navbar';
import DeleteConfirmModal from '@/components/DeleteConfirmModal';

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [errorCount, setErrorCount] = useState(0);
  const [toast, setToast] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchHistory();
    fetchErrorCount();
    const interval = setInterval(() => {
      fetchHistory();
      fetchErrorCount();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/history');
      if (res.ok) setHistory(await res.json());
    } catch {}
  };

  const fetchErrorCount = async () => {
    try {
      const res = await fetch('/api/errors');
      if (res.ok) {
        const data = await res.json();
        setErrorCount(data.length);
      }
    } catch {}
  };

  const handleScrape = async (e) => {
    e.preventDefault();
    if (!url || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (err) {
        throw new Error(`Server Error (${res.status}): ${text.substring(0, 50)}...`);
      }

      if (data.error) {
        setToast(data.error);
        setTimeout(() => setToast(null), 4000);
      } else if (data.slug) {
        router.push(`/scraper/${data.slug}`);
      }
    } catch (err) {
      setToast(err.message);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setLoading(false);
    }
  };

  const promptDelete = (e, item) => {
    e.stopPropagation();
    setItemToDelete(item);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/scraper/${itemToDelete.slug}`, { method: 'DELETE' });
      if (res.ok) {
        setItemToDelete(null);
        fetchHistory();
        setToast('✅ Data berhasil dihapus.');
        setTimeout(() => setToast(null), 3000);
      } else {
        const data = await res.json();
        setToast(data.error || 'Gagal menghapus data');
        setTimeout(() => setToast(null), 4000);
      }
    } catch (err) {
      setToast(err.message);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setIsDeleting(false);
    }
  };

  const statusBadge = (status) => {
    const map = {
      success: 'badge-success',
      processing: 'badge-processing',
      failed: 'badge-failed',
      partial: 'badge-partial',
    };
    return `badge ${map[status] || 'badge-processing'}`;
  };

  return (
    <>
      <Navbar errorCount={errorCount} />
      <div className="container">
        <h1 className="page-title">Scrape Microsoft Forms</h1>
        <p className="page-subtitle">
          Paste a public Microsoft Forms URL to extract its structure, questions, and choices.
        </p>

        <form onSubmit={handleScrape} className="glass-card scraper-input-card">
          <input
            type="url"
            placeholder="https://forms.cloud.microsoft/r/..."
            className="input-field"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
          <button type="submit" className="btn btn-primary" disabled={loading || !url}>
            {loading ? (
              <>
                <span className="spinner" />
                Scraping...
              </>
            ) : (
              <>
                <Search size={18} />
                Scrape Now
              </>
            )}
          </button>
        </form>

        <div className="glass-card">
          <div className="section-title">
            <Clock size={18} />
            Scraping History
          </div>
          {history.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <div>No scraping results yet. Paste a URL above to get started.</div>
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item._id}
                className="history-item"
                onClick={() => router.push(`/scraper/${item.slug}`)}
              >
                <div className="history-top-row">
                  <div className="history-title" style={{ flex: 1 }}>{item.title || item.url}</div>
                  <button 
                    type="button"
                    className="btn-icon"
                    onClick={(e) => promptDelete(e, item)}
                    title="Hapus Data"
                  >
                    <Trash2 size={16} />
                  </button>
                  <ChevronRight size={16} color="var(--text-muted)" style={{ marginLeft: '8px' }} />
                </div>
                <div className="history-meta">
                  <span className={statusBadge(item.status)}>{item.status}</span>
                  <span>{item.slug}</span>
                  <span>{new Date(item.createdAt).toLocaleString('id-ID')}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {toast && (
        <div className="toast">
          {toast}
        </div>
      )}

      {/* Modal Konfirmasi Hapus Data */}
      <DeleteConfirmModal
        isOpen={Boolean(itemToDelete)}
        onClose={() => !isDeleting && setItemToDelete(null)}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
        item={itemToDelete}
      />
    </>
  );
}
