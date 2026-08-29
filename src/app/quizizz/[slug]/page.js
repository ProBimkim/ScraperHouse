'use client';
import { useState, useEffect, use } from 'react';
import { ArrowLeft, ExternalLink, Search, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';

export default function QuizizzResultPage({ params }) {
  const { slug } = use(params);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let interval;
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/quizizz/${slug}`);
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
    q.choices?.some(c => c.text?.toLowerCase().includes(searchQuery.toLowerCase()))
  ) || [];

  if (error) {
    return (
      <>
        <Navbar />
        <div className="container">
          <Link href="/quizizz" className="btn btn-ghost btn-sm" style={{ marginBottom: '24px' }}>
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
        <Link href="/quizizz" className="btn btn-ghost btn-sm" style={{ marginBottom: '24px' }}>
          <ArrowLeft size={16} /> Back to Quizizz Scraper
        </Link>

        {/* Header Card */}
        <div className="glass-card" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '8px', color: '#a55eea' }}>
                {data?.title || 'Untitled Quiz'}
              </h1>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <a
                  href={data?.inputType === 'url' ? data.inputValue : `https://quizizz.com/join?gc=${data?.inputValue}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.9rem' }}
                >
                  {data?.inputValue} <ExternalLink size={13} />
                </a>
                {data?.subject && (
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px' }}>
                    {data.subject}
                  </span>
                )}
              </div>
              {data?.description && (
                <p style={{ color: 'var(--text-muted)', marginTop: '12px', fontSize: '0.95rem' }}>{data.description}</p>
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
              <div className="stat-label">Input Type</div>
              <div className="stat-value" style={{ textTransform: 'capitalize' }}>{data?.inputType === 'joinCode' ? 'Game PIN' : 'URL'}</div>
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
                  <div className="q-title" style={{ flex: 1 }}>
                    <span className="q-number" style={{ color: '#a55eea' }}>{data.questions.indexOf(q) + 1}.</span>
                    {q.title || <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>[No Text]</span>}
                  </div>
                  <div className="q-meta">
                    <span className="q-tag q-tag-type">{q.type}</span>
                  </div>
                </div>
                {q.imageUrl && (
                  <div style={{ margin: '16px 0' }}>
                    <img src={q.imageUrl} alt="Question Media" style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }} />
                  </div>
                )}
                
                {/* Choices Rendering */}
                {q.choices?.length > 0 ? (
                  <ul className="choice-list">
                    {q.choices.map((c, ci) => (
                      <li key={ci} className={`choice-item ${c.isCorrect ? 'choice-item-correct' : ''}`}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {c.text || <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>[Image Option]</span>}
                            {c.isCorrect && (
                              <span className="choice-correct-badge">
                                <CheckCircle2 size={12} style={{ display: 'inline', marginRight: '2px', verticalAlign: 'text-top' }} /> Correct
                              </span>
                            )}
                          </span>
                        </div>
                        {c.hasImage && c.imageUrl && (
                          <div style={{ marginTop: '8px' }}>
                            <img src={c.imageUrl} alt="Option Media" style={{ maxWidth: '150px', maxHeight: '150px', borderRadius: '6px' }} />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : q.correctAnswer ? (
                  <div style={{ padding: '12px', background: 'rgba(0, 214, 143, 0.1)', border: '1px solid var(--success)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--success)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px' }}>Correct Answer</div>
                    <div style={{ fontWeight: 600 }}>{q.correctAnswer}</div>
                  </div>
                ) : null}

                {/* Explanation */}
                {q.explanation && (
                  <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', borderLeft: '3px solid #a55eea' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>Explanation:</div>
                    <div style={{ fontSize: '0.9rem' }}>{q.explanation}</div>
                  </div>
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
            <div>No questions found in this quiz.</div>
          </div>
        ) : null}
      </div>
    </>
  );
}
