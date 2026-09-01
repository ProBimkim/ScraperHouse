'use client';
import { useState, useEffect, use } from 'react';
import { ArrowLeft, Loader2, ExternalLink, Search } from 'lucide-react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';

const FallbackImage = ({ primarySrc, fallbackSrc, alt, style }) => {
  const [imgSrc, setImgSrc] = useState(primarySrc);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setImgSrc(primarySrc);
    setHasError(false);
  }, [primarySrc]);

  return (
    <img
      src={imgSrc || ''}
      alt={alt}
      style={style}
      onError={() => {
        if (!hasError && fallbackSrc) {
          setImgSrc(fallbackSrc);
          setHasError(true);
        }
      }}
    />
  );
};

export default function ScraperResult({ params }) {
  const { slug } = use(params);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let interval;
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/scraper/${slug}`);
        if (!res.ok) {
          setError(res.status === 404 ? 'Result not found' : 'Failed to fetch');
          setLoading(false);
          return;
        }
        const json = await res.json();
        setData(json);
        if (json.status !== 'processing') {
          setLoading(false);
          if (interval) clearInterval(interval);
        }
      } catch (e) {
        setError(e.message);
        setLoading(false);
      }
    };
    fetchData();
    interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [slug]);

  const statusBadge = (status) => {
    const map = {
      success: 'badge-success',
      processing: 'badge-processing',
      failed: 'badge-failed',
      partial: 'badge-partial',
    };
    return `badge ${map[status] || ''}`;
  };

  const filteredQuestions = data?.questions?.filter(q => 
    q.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    q.choices?.some(c => (typeof c === 'string' ? c : c.text)?.toLowerCase().includes(searchQuery.toLowerCase()))
  ) || [];

  if (error) {
    return (
      <>
        <Navbar />
        <div className="container">
          <Link href="/" className="btn btn-ghost btn-sm" style={{ marginBottom: '24px' }}>
            <ArrowLeft size={16} /> Back
          </Link>
          <div className="glass-card" style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ fontSize: '2rem', marginBottom: '12px' }}>❌</div>
            <div style={{ color: 'var(--error)', fontWeight: 600 }}>{error}</div>
          </div>
        </div>
      </>
    );
  }

  if (loading && !data) {
    return (
      <>
        <Navbar />
        <div className="loading-screen">
          <div className="spinner" />
          <div style={{ color: 'var(--text-muted)' }}>Loading {slug}...</div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="container">
        <Link href="/" className="btn btn-ghost btn-sm" style={{ marginBottom: '24px' }}>
          <ArrowLeft size={16} /> Back to Scraping
        </Link>

        {/* Header Card */}
        <div className="glass-card" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '8px' }}>
                {data?.title || 'Untitled Form'}
              </h1>
              <a
                href={data?.url}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.9rem' }}
              >
                {data?.url} <ExternalLink size={13} />
              </a>
              {data?.description && (
                <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>{data.description}</p>
              )}
            </div>
            <span className={statusBadge(data?.status)} style={{ fontSize: '0.8rem', padding: '5px 14px' }}>
              {data?.status === 'processing' ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> Processing
                </span>
              ) : (
                data?.status
              )}
            </span>
          </div>

          <div className="result-stats">
            <div className="stat-item">
              <div className="stat-label">Questions</div>
              <div className="stat-value">{data?.jumlah_pertanyaan || 0}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Slug</div>
              <div className="stat-value" style={{ fontSize: '1.2rem', color: 'var(--accent)' }}>{data?.slug}</div>
            </div>
          </div>
        </div>

        {/* Scrape Steps Debug */}
        {data?.scrapeSteps && data.scrapeSteps.length > 0 && (
          <details className="glass-card" style={{ marginBottom: '20px', cursor: 'pointer' }}>
            <summary style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '8px' }}>
              🔍 Scrape Steps ({data.scrapeSteps.length} steps)
            </summary>
            <div className="steps-timeline">
              {data.scrapeSteps.map((s, i) => (
                <div key={i} className="step-item">
                  <div className={`step-dot ${s.status === 'ok' ? 'step-dot-ok' : s.status === 'failed' ? 'step-dot-fail' : 'step-dot-wait'}`} />
                  <span className="step-name">{s.step}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>— {s.status}</span>
                  {s.message && <span style={{ color: 'var(--error)', fontSize: '0.8rem', marginLeft: 'auto' }}>{s.message}</span>}
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Search Bar */}
        {data?.questions?.length > 0 && (
          <div className="glass-card" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', padding: '12px 24px' }}>
            <Search size={18} color="var(--text-muted)" style={{ marginRight: '12px' }} />
            <input 
              type="text" 
              placeholder="Cari soal atau pilihan ganda..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-main)', fontSize: '1rem', outline: 'none' }}
            />
          </div>
        )}

        {/* Questions */}
        {data?.questions?.length > 0 ? (
          filteredQuestions.length > 0 ? (
            filteredQuestions.map((q, idx) => (
              <div key={idx} className="glass-card question-card">
                <div className="q-header">
                  <div className="q-title">
                    <span className="q-number">{data.questions.indexOf(q) + 1}.</span>
                    {q.title}
                  </div>
                  <div className="q-meta">
                    <span className="q-tag q-tag-type">{q.type}</span>
                    {q.required && <span className="q-tag q-tag-required">Required</span>}
                  </div>
                </div>
                {q.imageUrl && (
                  <div style={{ margin: '16px 0' }}>
                    <FallbackImage primarySrc={q.imageUrl} fallbackSrc={q.originalImageUrl} alt="Question Image" style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }} />
                  </div>
                )}
                {q.choices?.length > 0 && (
                  <ul className="choice-list">
                    {q.choices.map((c, ci) => {
                      const text = typeof c === 'object' && c !== null ? c.text : c;
                      const cImg = typeof c === 'object' && c !== null ? c.imageUrl : null;
                      const cOrigImg = typeof c === 'object' && c !== null ? c.originalImageUrl : null;
                      return (
                        <li key={ci} className="choice-item">
                          <div>
                            {text || (cImg ? <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>[Image Option]</span> : '')}
                          </div>
                          {cImg && (
                            <div style={{ marginTop: '8px' }}>
                              <FallbackImage primarySrc={cImg} fallbackSrc={cOrigImg} alt="Option Image" style={{ maxWidth: '150px', maxHeight: '150px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }} />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))
          ) : (
            <div className="glass-card empty-state" style={{ padding: '30px' }}>
              <div style={{ color: 'var(--text-muted)' }}>Tidak ada soal yang cocok dengan pencarian.</div>
            </div>
          )
        ) : data?.status !== 'processing' ? (
          <div className="glass-card empty-state">
            <div className="empty-state-icon">📝</div>
            <div>No questions found in this form.</div>
          </div>
        ) : null}
      </div>
    </>
  );
}
