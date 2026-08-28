'use client';
import { useState, useEffect } from 'react';
import { Search, Copy, CheckCircle, ChevronRight, Loader2, AlertCircle } from 'lucide-react';

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [globalErrors, setGlobalErrors] = useState([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchHistory();
    fetchErrors();
    const interval = setInterval(() => {
      fetchHistory();
      fetchErrors();
    }, 5000); // Polling for updates
    return () => clearInterval(interval);
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchErrors = async () => {
    try {
      const res = await fetch('/api/errors');
      if (res.ok) {
        const data = await res.json();
        setGlobalErrors(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleScrape = async (e) => {
    e.preventDefault();
    if (!url) return;
    setLoading(true);
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (data.slug) {
        window.location.href = `/scraper/${data.slug}`;
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const copyErrors = () => {
    const text = JSON.stringify(globalErrors, null, 2);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const markErrorDone = async (id) => {
    try {
      await fetch(`/api/errors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved: true })
      });
      fetchErrors();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="container">
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <h1 className="title">MS Forms Scraper</h1>
        <p className="subtitle">Premium extraction tool powered by Puppeteer & MongoDB</p>
      </div>

      {globalErrors.length > 0 && (
        <div className="glass-card error-panel">
          <div className="error-header">
            <div className="error-title">
              <AlertCircle size={20} /> Action Required: Auto-Debugging Detected Errors
            </div>
            <div className="error-actions">
              <button className="btn btn-secondary" onClick={copyErrors} style={{ padding: '8px 12px', fontSize: '0.9rem' }}>
                <Copy size={16} /> {copied ? 'Copied!' : 'Copy All Errors'}
              </button>
            </div>
          </div>
          {globalErrors.map(errLog => (
            <div key={errLog._id} style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <strong>URL: {errLog.url}</strong>
                <button className="btn btn-success" onClick={() => markErrorDone(errLog._id)} style={{ padding: '4px 12px', fontSize: '0.85rem' }}>
                  <CheckCircle size={14} /> Error Done
                </button>
              </div>
              {errLog.errors.map((e, idx) => (
                <div key={idx} className="error-item">
                  <div className="error-message">[{e.type}] {e.step} - {e.message}</div>
                  <div className="error-stack">{e.stack}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleScrape} className="input-group glass-card" style={{ padding: '12px 12px 12px 24px', alignItems: 'center' }}>
        <input 
          type="url" 
          placeholder="Paste Microsoft Forms URL here..." 
          className="input-field"
          style={{ border: 'none', background: 'transparent', padding: 0 }}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <button type="submit" className="btn" disabled={loading || !url}>
          {loading ? <Loader2 className="loader" size={20} style={{ border: 'none' }}/> : <Search size={20} />}
          {loading ? 'Processing...' : 'Scrape Now'}
        </button>
      </form>

      <div className="glass-card">
        <h2 style={{ marginBottom: '20px', fontSize: '1.2rem' }}>Scraping History</h2>
        {history.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>No previous scrapes found.</div>
        ) : (
          <div>
            {history.map(item => (
              <div key={item._id} className="history-item" onClick={() => window.location.href = `/scraper/${item.slug}`}>
                <div className="history-meta" style={{ marginBottom: '8px' }}>
                  <span className={`status-badge status-${item.status}`}>{item.status}</span>
                  <span>{new Date(item.createdAt).toLocaleString()}</span>
                </div>
                <div className="history-title">{item.title || item.url}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  <span>{item.slug}</span>
                  <ChevronRight size={16} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
