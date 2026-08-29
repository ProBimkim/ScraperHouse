'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ChevronRight, Clock, CheckCircle, Trash2, KeyRound, Link as LinkIcon } from 'lucide-react';
import Navbar from '@/components/Navbar';

export default function QuizizzHome() {
  const router = useRouter();
  const [inputType, setInputType] = useState('url'); // 'url' or 'joinCode'
  const [inputValue, setInputValue] = useState('');
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
      const res = await fetch('/api/quizizz/history');
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
    if (!inputValue || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/quizizz/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: inputValue, inputType }),
      });
      const data = await res.json();
      if (data.error) {
        setToast(data.error);
        setTimeout(() => setToast(null), 4000);
      } else if (data.slug) {
        router.push(`/quizizz/${data.slug}`);
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
    if (!confirm('Are you sure you want to delete this result?')) return;
    
    try {
      const res = await fetch(`/api/quizizz/${slug}`, { method: 'DELETE' });
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
        <h1 className="page-title">Scrape Quizizz</h1>
        <p className="page-subtitle">
          Extract questions and reveal correct answers from Quizizz using a URL or Game PIN.
        </p>

        {/* Input Form */}
        <div className="glass-card" style={{ padding: '24px', marginBottom: '28px' }}>
          <div className="tab-group">
            <button 
              className={`tab-btn ${inputType === 'url' ? 'active' : ''}`}
              onClick={() => { setInputType('url'); setInputValue(''); }}
            >
              <LinkIcon size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              Quiz URL
            </button>
            <button 
              className={`tab-btn ${inputType === 'joinCode' ? 'active' : ''}`}
              onClick={() => { setInputType('joinCode'); setInputValue(''); }}
            >
              <KeyRound size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              Game PIN (Join Code)
            </button>
          </div>

          <form onSubmit={handleScrape} className="scraper-input-card" style={{ padding: 0, margin: 0, border: 'none', background: 'transparent' }}>
            <input
              type={inputType === 'url' ? 'url' : 'text'}
              placeholder={inputType === 'url' ? 'https://quizizz.com/admin/quiz/...' : 'Enter 6-8 digit Game PIN'}
              className="input-field"
              style={{ padding: '16px 20px', background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-sm)' }}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-primary" disabled={loading || !inputValue} style={{ padding: '16px 24px' }}>
              {loading ? (
                <>
                  <span className="spinner" />
                  Processing...
                </>
              ) : (
                <>
                  <Search size={18} />
                  Scrape Now
                </>
              )}
            </button>
          </form>
        </div>

        <div className="glass-card">
          <div className="section-title">
            <Clock size={18} />
            Scraping History
          </div>
          {history.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <div>No scraping results yet. Enter a URL or Game PIN above.</div>
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item._id}
                className="history-item"
                onClick={() => router.push(`/quizizz/${item.slug}`)}
              >
                <div className="history-top-row">
                  <div className="history-title" style={{ flex: 1 }}>{item.title || item.inputValue}</div>
                  <button 
                    className="btn btn-ghost btn-sm" 
                    style={{ padding: '4px', color: 'var(--error)' }}
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
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {item.inputType === 'url' ? <LinkIcon size={12} /> : <KeyRound size={12} />}
                    {item.inputType.toUpperCase()}
                  </span>
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
