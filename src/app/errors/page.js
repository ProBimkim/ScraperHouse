'use client';
import { useState, useEffect } from 'react';
import { Copy, CheckCircle2, AlertTriangle, ShieldCheck, RefreshCw } from 'lucide-react';
import Navbar from '@/components/Navbar';

export default function ErrorMonitorPage() {
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [toast, setToast] = useState(null);
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    fetchErrors();
    const interval = setInterval(fetchErrors, 5000);
    return () => clearInterval(interval);
  }, [showResolved]);

  const fetchErrors = async () => {
    try {
      const query = showResolved ? '?all=true' : '';
      const res = await fetch(`/api/errors${query}`);
      if (res.ok) setErrors(await res.json());
    } catch {}
    setLoading(false);
  };

  const copyAllErrors = async () => {
    const unresolvedErrors = errors.filter((e) => !e.resolved);
    const formatted = unresolvedErrors
      .map((errLog) => {
        const header = `=== ${errLog.slug || errLog.url} (${new Date(errLog.createdAt).toLocaleString('id-ID')}) ===`;
        const entries = errLog.errors
          .map((e) => `[${e.type}] Step: ${e.step}\nMessage: ${e.message}\n${e.stack ? `Stack: ${e.stack}` : ''}`)
          .join('\n---\n');
        return `${header}\n${entries}`;
      })
      .join('\n\n');

    try {
      await navigator.clipboard.writeText(formatted || 'No unresolved errors.');
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setToast('Clipboard access denied');
      setTimeout(() => setToast(null), 3000);
    }
  };

  const resolveAllErrors = async () => {
    setResolving(true);
    try {
      const res = await fetch('/api/errors', {
        method: 'PATCH',
      });
      if (res.ok) {
        const data = await res.json();
        setToast(`✅ ${data.modifiedCount} error(s) marked as resolved`);
        setTimeout(() => setToast(null), 3000);
        fetchErrors();
      }
    } catch (err) {
      setToast(`Failed: ${err.message}`);
      setTimeout(() => setToast(null), 3000);
    }
    setResolving(false);
  };

  const resolveOne = async (id) => {
    try {
      const res = await fetch(`/api/errors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved: true }),
      });
      if (res.ok) fetchErrors();
    } catch {}
  };

  const unresolvedCount = errors.filter((e) => !e.resolved).length;

  return (
    <>
      <Navbar errorCount={unresolvedCount} />
      <div className="container">
        <h1 className="page-title">Error Monitor</h1>
        <p className="page-subtitle">
          Auto-debugging dashboard — all scraping errors are captured and displayed here.
        </p>

        {/* Summary Bar */}
        <div className="glass-card" style={{ marginBottom: '24px' }}>
          <div className="error-summary-bar">
            <div>
              <div className="error-count">{unresolvedCount}</div>
              <div className="error-count-label">Unresolved Error{unresolvedCount !== 1 ? 's' : ''}</div>
            </div>
            <div className="error-actions">
              <button className="btn btn-ghost" onClick={copyAllErrors}>
                <Copy size={16} />
                {copied ? 'Copied!' : 'Salin Semua Error'}
              </button>
              <button
                className="btn btn-success"
                onClick={resolveAllErrors}
                disabled={resolving || unresolvedCount === 0}
              >
                <ShieldCheck size={16} />
                {resolving ? 'Processing...' : 'All Error Solved'}
              </button>
            </div>
          </div>

          {/* Toggle */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button
              className={`btn btn-sm ${!showResolved ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setShowResolved(false)}
            >
              Unresolved
            </button>
            <button
              className={`btn btn-sm ${showResolved ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setShowResolved(true)}
            >
              Show All
            </button>
            <button className="btn btn-sm btn-ghost" onClick={fetchErrors} style={{ marginLeft: 'auto' }}>
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>
        </div>

        {/* Error List */}
        {loading ? (
          <div className="loading-screen">
            <div className="spinner" />
            <div style={{ color: 'var(--text-muted)' }}>Loading errors...</div>
          </div>
        ) : errors.length === 0 ? (
          <div className="glass-card empty-state">
            <div className="empty-state-icon">🛡️</div>
            <div>No errors found. Everything is running smoothly!</div>
          </div>
        ) : (
          errors.map((errLog) => (
            <div key={errLog._id} className="error-group" style={errLog.resolved ? { opacity: 0.5 } : {}}>
              <div className="error-group-header">
                <div className="error-group-title">
                  {errLog.resolved ? (
                    <CheckCircle2 size={16} color="var(--success)" />
                  ) : (
                    <AlertTriangle size={16} />
                  )}
                  {errLog.slug || 'Unknown'} — {errLog.url}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="error-group-meta">
                    {new Date(errLog.createdAt).toLocaleString('id-ID')}
                  </span>
                  {!errLog.resolved && (
                    <button className="btn btn-sm btn-error" onClick={() => resolveOne(errLog._id)}>
                      <CheckCircle2 size={12} /> Resolve
                    </button>
                  )}
                </div>
              </div>
              {errLog.errors.map((e, idx) => (
                <div key={idx} className="error-entry">
                  <div className="error-entry-step">Step: {e.step}</div>
                  <div className="error-entry-msg">[{e.type}] {e.message}</div>
                  {e.stack && <div className="error-entry-stack">{e.stack}</div>}
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {toast && (
        <div className="toast">
          {toast}
        </div>
      )}
    </>
  );
}
