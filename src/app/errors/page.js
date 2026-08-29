'use client';
import { useState, useEffect } from 'react';
import { Copy, CheckCircle2, AlertTriangle, ShieldCheck, RefreshCw, FormInput, Gamepad2 } from 'lucide-react';
import Navbar from '@/components/Navbar';

export default function ErrorMonitorPage() {
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [toast, setToast] = useState(null);
  const [showResolved, setShowResolved] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('all'); // all, msforms, quizizz

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
    const unresolvedErrors = errors.filter((e) => !e.resolved && (sourceFilter === 'all' || e.source === sourceFilter));
    const formatted = unresolvedErrors
      .map((errLog) => {
        const header = `=== [${errLog.source.toUpperCase()}] ${errLog.slug || errLog.url} (${new Date(errLog.createdAt).toLocaleString('id-ID')}) ===`;
        
        let trace = '';
        if (errLog.debugContext && errLog.debugContext.steps) {
          trace = 'Full Scrape Steps Trace:\n' + errLog.debugContext.steps.map((s, i) => 
            `  ${i + 1}. [${s.status.toUpperCase()}] ${s.step}${s.message ? ` - ${s.message}` : ''}`
          ).join('\n') + '\n\n';
        }

        const entries = errLog.errors
          .map((e) => `[${e.type}] Step: ${e.step}\nMessage: ${e.message}\n${e.stack ? `Stack:\n${e.stack}` : ''}`)
          .join('\n---\n');
          
        return `${header}\n${trace}${entries}`;
      })
      .join('\n\n\n');

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

  const filteredErrors = errors.filter(e => sourceFilter === 'all' || e.source === sourceFilter);
  const unresolvedCount = filteredErrors.filter((e) => !e.resolved).length;
  const totalUnresolved = errors.filter(e => !e.resolved).length; // Global unresolved

  const getSourceBadge = (source) => {
    if (source === 'quizizz') {
      return <span style={{ background: 'rgba(136, 84, 192, 0.2)', color: '#a55eea', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Gamepad2 size={10} /> Quizizz</span>;
    }
    return <span style={{ background: 'rgba(124, 108, 240, 0.2)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><FormInput size={10} /> MS Forms</span>;
  };

  return (
    <>
      <Navbar errorCount={totalUnresolved} />
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
              <div className="error-count-label">Unresolved Error{unresolvedCount !== 1 ? 's' : ''} {sourceFilter !== 'all' ? `in ${sourceFilter}` : ''}</div>
            </div>
            <div className="error-actions">
              <button className="btn btn-ghost" onClick={copyAllErrors}>
                <Copy size={16} />
                {copied ? 'Copied!' : 'Copy Errors'}
              </button>
              <button
                className="btn btn-success"
                onClick={resolveAllErrors}
                disabled={resolving || totalUnresolved === 0}
              >
                <ShieldCheck size={16} />
                {resolving ? 'Processing...' : 'Resolve All'}
              </button>
            </div>
          </div>

          {/* Toggle */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-sm)', padding: '4px' }}>
              <button className={`btn btn-sm ${sourceFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`} style={{ border: 'none' }} onClick={() => setSourceFilter('all')}>All Sources</button>
              <button className={`btn btn-sm ${sourceFilter === 'msforms' ? 'btn-primary' : 'btn-ghost'}`} style={{ border: 'none' }} onClick={() => setSourceFilter('msforms')}>MS Forms</button>
              <button className={`btn btn-sm ${sourceFilter === 'quizizz' ? 'btn-primary' : 'btn-ghost'}`} style={{ border: 'none' }} onClick={() => setSourceFilter('quizizz')}>Quizizz</button>
            </div>
            <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 8px' }}></div>
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
        ) : filteredErrors.length === 0 ? (
          <div className="glass-card empty-state">
            <div className="empty-state-icon">🛡️</div>
            <div>No errors found for this filter. Everything is running smoothly!</div>
          </div>
        ) : (
          filteredErrors.map((errLog) => (
            <div key={errLog._id} className="error-group" style={errLog.resolved ? { opacity: 0.5 } : {}}>
              <div className="error-group-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                  <div className="error-group-title" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                    {errLog.resolved ? (
                      <CheckCircle2 size={16} color="var(--success)" />
                    ) : (
                      <AlertTriangle size={16} />
                    )}
                    <span style={{ wordBreak: 'break-all' }}>{errLog.slug || 'Unknown'} — {errLog.url}</span>
                    {getSourceBadge(errLog.source)}
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
              </div>
              
              <div style={{ padding: '14px 18px', background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>Diagnostic Explanation:</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {errLog.source === 'quizizz' ? 
                    "Quizizz scraping failed. This usually happens if the Quiz URL is private, the Game PIN is invalid/expired, or Quizizz updated their internal API structure. Check the specific step failures below." :
                    "MS Forms scraping failed. This may happen if the form requires organizational login, has anti-bot CAPTCHAs, or the Puppeteer browser failed to intercept the '/formapi' network payload."}
                </div>
              </div>

              {errLog.errors.map((e, idx) => (
                <div key={idx} className="error-entry">
                  <div className="error-entry-step" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--warning)' }}></span>
                    Failed at Step: <strong>{e.step}</strong>
                  </div>
                  <div className="error-entry-msg">[{e.type}] {e.message}</div>
                  {e.stack && (
                    <details style={{ marginTop: '8px' }}>
                      <summary style={{ fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer', outline: 'none' }}>View Stack Trace</summary>
                      <div className="error-entry-stack" style={{ background: '#0a0a0a', padding: '10px', borderRadius: '4px', marginTop: '6px', border: '1px solid #222' }}>{e.stack}</div>
                    </details>
                  )}
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
