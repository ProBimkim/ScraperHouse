'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ChevronRight, Loader2, Clock, CheckCircle, Trash2 } from 'lucide-react';
import Navbar from '@/components/Navbar';

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [errorCount, setErrorCount] = useState(0);
  const [toast, setToast] = useState(null);

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

  const handleDelete = async (e, slug) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this scraper result?')) return;
    
    try {
      const res = await fetch(`/api/scraper/${slug}`, { method: 'DELETE' });
      if (res.ok) {
        fetchHistory();
      } else {
        const data = await res.json();
        setToast(data.error || 'Failed to delete');
        setTimeout(() => setToast(null), 4000);
      }
    } catch (err) {
      setToast(err.message);
      setTimeout(() => setToast(null), 4000);
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
                    className="btn-icon"
                    onClick={(e) => handleDelete(e, item.slug)}
                    title="Delete Result"
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
          <span style={{ color: 'var(--error)' }}>⚠️</span> {toast}
        </div>
      )}
    </>
  );
}
