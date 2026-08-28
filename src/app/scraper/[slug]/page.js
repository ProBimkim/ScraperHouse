'use client';
import { useState, useEffect, use } from 'react';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function ScraperResult({ params }) {
  const { slug } = use(params);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData(); // Keep polling in case it's processing
    }, 3000);
    return () => clearInterval(interval);
  }, [slug]);

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/scraper/${slug}`);
      if (!res.ok) {
        if (res.status === 404) setError('Result not found');
        else setError('Failed to fetch data');
        setLoading(false);
        return;
      }
      const json = await res.json();
      setData(json);
      if (json.status !== 'processing') {
        setLoading(false);
      }
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  if (error) {
    return (
      <div className="container">
        <Link href="/" className="btn btn-secondary" style={{ display: 'inline-flex', marginBottom: '24px' }}>
          <ArrowLeft size={16} /> Back to Home
        </Link>
        <div className="glass-card error-panel">
          <div className="error-title"><AlertCircle size={20} /> Error</div>
          <div>{error}</div>
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="container" style={{ textAlign: 'center', paddingTop: '100px' }}>
        <Loader2 className="loader" size={48} style={{ margin: '0 auto 20px', borderTopColor: 'var(--primary)', borderRightColor: 'rgba(255,255,255,0.1)' }} />
        <div style={{ color: 'var(--text-muted)' }}>Loading {slug}...</div>
      </div>
    );
  }

  return (
    <div className="container">
      <Link href="/" className="btn btn-secondary" style={{ display: 'inline-flex', marginBottom: '24px', padding: '8px 16px', fontSize: '0.9rem' }}>
        <ArrowLeft size={16} /> Back to Home
      </Link>

      <div className="glass-card result-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '8px' }}>{data?.title || 'Untitled Form'}</h1>
            <a href={data?.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              {data?.url}
            </a>
            {data?.description && <p className="result-desc">{data.description}</p>}
          </div>
          <div className={`status-badge status-${data?.status}`} style={{ fontSize: '0.9rem', padding: '6px 16px' }}>
            {data?.status === 'processing' ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Loader2 className="loader" size={14} style={{ border: '2px solid transparent', borderTop: '2px solid var(--primary)' }} /> Processing...
              </span>
            ) : data?.status}
          </div>
        </div>
        <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border)', display: 'flex', gap: '24px' }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Questions</div>
            <div style={{ fontSize: '1.5rem', fontWeight: '600' }}>{data?.jumlah_pertanyaan || 0}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Slug</div>
            <div style={{ fontSize: '1.5rem', fontWeight: '600' }}>{data?.slug}</div>
          </div>
        </div>
      </div>

      {data?.questions?.length > 0 ? (
        <div style={{ display: 'grid', gap: '16px' }}>
          {data.questions.map((q, idx) => (
            <div key={idx} className="glass-card question-card">
              <div className="q-header">
                <div className="q-title">
                  <span style={{ color: 'var(--primary)', marginRight: '8px' }}>{idx + 1}.</span> 
                  {q.title}
                </div>
                <div className="q-meta">
                  <span className="q-type">{q.type}</span>
                  {q.required && <span className="q-req">Required</span>}
                </div>
              </div>
              {q.choices && q.choices.length > 0 && (
                <ul className="choice-list">
                  {q.choices.map((choice, cIdx) => (
                    <li key={cIdx} className="choice-item">{choice}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      ) : (
        data?.status === 'success' && (
          <div className="glass-card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
            No questions found in this form.
          </div>
        )
      )}
    </div>
  );
}
