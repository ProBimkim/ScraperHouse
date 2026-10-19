'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import styles from '../page.module.css';
import { 
  ShieldAlert, 
  ArrowLeft, 
  Calendar, 
  Download, 
  Copy, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  FileCode, 
  ExternalLink,
  Printer,
  Search,
  Loader2,
  Key,
  Lock,
  Shield,
  Trash2,
  Database,
  Bug,
  Layers,
  ListChecks,
  AlertTriangle,
  Server,
  HardDrive,
  Cpu,
  Camera
} from 'lucide-react';
import DeleteConfirmModal from '@/components/DeleteConfirmModal';
import AccountTakeoverAssessmentCard from '@/components/strix/AccountTakeoverAssessmentCard';

export default function StrixDetailPage({ params }) {
  const { id } = use(params);

  const router = useRouter();
  const [scanResult, setScanResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [severityFilter, setSeverityFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedVulns, setExpandedVulns] = useState({});
  const [copiedId, setCopiedId] = useState(null);

  // Deletion state
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    async function fetchDetail() {
      setLoading(true);
      try {
        const res = await fetch(`/api/strix/${id}`);
        if (!res.ok) throw new Error('Audit report not found');
        const data = await res.json();
        setScanResult(data);
        const expandInit = {};
        (data.vulnerabilities || []).forEach((v, idx) => {
          if (v.severity === 'critical' || v.severity === 'high' || idx === 0) {
            expandInit[v.id || idx] = true;
          }
        });
        setExpandedVulns(expandInit);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchDetail();
  }, [id]);

  const handleDeleteConfirm = async (password) => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/strix/${id}?password=${encodeURIComponent(password)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showToast('Audit report deleted successfully.', 'success');
        setTimeout(() => {
          router.push('/strix');
        }, 600);
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to delete audit. Please check password.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Error deleting audit.', 'error');
    } finally {
      setIsDeleting(false);
      setItemToDelete(null);
    }
  };

  const toggleVuln = (vId) => {
    setExpandedVulns((prev) => ({ ...prev, [vId]: !prev[vId] }));
  };

  const handleCopy = (text, cId) => {
    navigator.clipboard.writeText(text);
    setCopiedId(cId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const downloadJSON = () => {
    if (!scanResult) return;
    const blob = new Blob([JSON.stringify(scanResult.vulnerabilities || [], null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vulnerabilities_${scanResult.slug || id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadSARIF = () => {
    if (!scanResult?.sarif) return;
    const blob = new Blob([JSON.stringify(scanResult.sarif, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `findings_${scanResult.slug || id}.sarif`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredVulns = (scanResult?.vulnerabilities || []).filter((v) => {
    if (severityFilter !== 'all' && v.severity?.toLowerCase() !== severityFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = v.title?.toLowerCase().includes(q);
      const matchCwe = v.cwe?.toLowerCase().includes(q);
      const matchOwasp = v.owaspCategory?.toLowerCase().includes(q);
      return matchTitle || matchCwe || matchOwasp;
    }
    return true;
  });

  return (
    <>
      <Navbar />
      <div className={styles.strixContainer}>
        <div style={{ marginBottom: '24px' }}>
          <Link href="/strix" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            <ArrowLeft size={16} /> Back to Strix Pentester
          </Link>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
            <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 12px' }} />
            <p>Loading security audit report...</p>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#f87171' }}>
            <p>{error}</p>
          </div>
        ) : (
          scanResult && (
            <div>
              {/* Risk Banner */}
              <div className={styles.riskBanner}>
                <div className={styles.riskGauge}>
                  <span className={styles.riskScoreNum}>{scanResult.summary?.riskScore || 0}</span>
                  <span className={styles.riskScoreLabel}>Risk Score</span>
                </div>

                <div>
                  <h2 className={styles.riskInfoTitle}>
                    Security Assessment: {scanResult.summary?.riskRating} RISK
                  </h2>
                  <p className={styles.riskInfoTarget}>
                    Target: <strong>{scanResult.target}</strong> • Mode: {scanResult.scanMode?.toUpperCase()} • {scanResult.vulnerabilities?.length || 0} Findings Discovered
                  </p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                    <Calendar size={14} /> {new Date(scanResult.createdAt).toLocaleString()}
                  </p>
                </div>

                <div className={styles.severityCounters}>
                  <div className={`${styles.sevBadge} ${styles.sevBadgeCrit}`}>
                    <span className={styles.sevCount}>{scanResult.summary?.critical || 0}</span>
                    <span className={styles.sevName}>Critical</span>
                  </div>
                  <div className={`${styles.sevBadge} ${styles.sevBadgeHigh}`}>
                    <span className={styles.sevCount}>{scanResult.summary?.high || 0}</span>
                    <span className={styles.sevName}>High</span>
                  </div>
                  <div className={`${styles.sevBadge} ${styles.sevBadgeMed}`}>
                    <span className={styles.sevCount}>{scanResult.summary?.medium || 0}</span>
                    <span className={styles.sevName}>Medium</span>
                  </div>
                  <div className={`${styles.sevBadge} ${styles.sevBadgeLow}`}>
                    <span className={styles.sevCount}>{scanResult.summary?.low || 0}</span>
                    <span className={styles.sevName}>Low</span>
                  </div>
                </div>
              </div>

              {/* Executive Summary */}
              {scanResult.executiveSummary && (
                <div className={styles.summaryBox}>
                  <div className={styles.summaryTitle}>
                    <FileCode size={18} style={{ color: '#f87171' }} />
                    Executive Security Briefing
                  </div>
                  <p>{scanResult.executiveSummary}</p>
                </div>
              )}

              {/* Reconnaissance & Attack Surface Card */}
              {scanResult.recon && (
                <div className={styles.reconGrid}>
                  {/* Extracted .env Endpoints */}
                  {scanResult.recon.envEndpoints?.length > 0 && (
                    <div className={styles.reconCard} style={{ gridColumn: '1 / -1', borderColor: 'rgba(245, 158, 11, 0.35)' }}>
                      <div className={styles.reconCardTitle} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fbbf24' }}>
                        <Key size={16} />
                        Extracted .env Endpoints & Configurations ({scanResult.recon.envEndpoints.length})
                      </div>
                      <div className={styles.envListTable}>
                        {scanResult.recon.envEndpoints.map((item, idx) => (
                          <div key={idx} className={styles.envRow}>
                            <span className={styles.envKey}>{item.key}</span>
                            <span className={styles.envVal}>{item.value}</span>
                            <span className={item.isSecret ? styles.envBadge : styles.reconTagInfo}>
                              {item.isSecret ? 'SECRET' : item.type}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Discovered Admin Endpoints */}
                  {scanResult.recon.adminEndpoints?.length > 0 && (
                    <div className={styles.reconCard} style={{ borderColor: scanResult.recon.adminEndpoints.some(a => a.accessible) ? 'rgba(239, 68, 68, 0.4)' : 'rgba(59, 130, 246, 0.25)' }}>
                      <div className={styles.reconCardTitle} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171' }}>
                        <Lock size={16} />
                        Discovered Admin Interfaces (/admin) ({scanResult.recon.adminEndpoints.length})
                      </div>
                      <div className={styles.reconTagList}>
                        {scanResult.recon.adminEndpoints.map((adm, i) => (
                          <span
                            key={i}
                            className={adm.accessible ? styles.reconTagDanger : styles.reconTag}
                          >
                            {adm.path} {adm.status ? `(HTTP ${adm.status})` : ''} - {adm.accessible ? 'EXPOSED' : 'Protected'}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Discovered Login Endpoints */}
                  {/* Discovered Login Endpoints (Burp-style parameter inspection & fuzzing) */}
                  {scanResult.recon.loginEndpoints?.length > 0 && (
                    <div className={styles.reconCard} style={{ gridColumn: '1 / -1' }}>
                      <div className={styles.reconCardTitle} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#60a5fa' }}>
                        <Shield size={16} />
                        Authentication & Login Security Diagnostics ({scanResult.recon.loginEndpoints.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {scanResult.recon.loginEndpoints.map((log, i) => (
                          <div key={i} style={{ background: 'rgba(2, 6, 23, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', padding: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                              <span style={{ fontWeight: 600, color: '#f1f5f9', fontFamily: 'monospace' }}>
                                [{log.method || 'POST'}] {log.path} {log.status ? `(HTTP ${log.status})` : ''}
                              </span>
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {log.fuzzResult === 'BYPASS_DETECTED' && (
                                  <span className={styles.reconTagDanger}>SQLi BYPASS CONFIRMED</span>
                                )}
                                {log.fuzzResult === 'SQL_ERROR_LEAK' && (
                                  <span className={styles.reconTagWarning}>SQL ERROR LEAK</span>
                                )}
                                <span className={log.hasCsrf ? styles.reconTagSuccess : styles.reconTagWarning}>
                                  {log.hasCsrf ? 'CSRF: Protected' : 'CSRF: Missing'}
                                </span>
                                <span className={log.rateLimitDetected ? styles.reconTagSuccess : styles.reconTagWarning}>
                                  {log.rateLimitDetected ? 'Rate-Limit: Enforced' : 'Intruder: No Rate-Limit'}
                                </span>
                              </div>
                            </div>
                            {log.fields?.length > 0 && (
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Intercepted Parameters: <code style={{ color: '#fbbf24' }}>{log.fields.join(', ')}</code>
                              </div>
                            )}
                            {log.note && (
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                {log.note}
                              </div>
                            )}

                            {log.bypassEvidence && (
                              <div style={{ marginTop: '8px', padding: '8px 10px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', fontSize: '0.8rem', color: '#fca5a5' }}>
                                <strong>⚡ Bypass Analysis & Proof:</strong> {log.bypassEvidence}
                              </div>
                            )}

                            {log.sqlErrorEvidence && (
                              <div style={{ marginTop: '8px', padding: '8px 10px', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '6px', fontSize: '0.8rem', color: '#fbbf24' }}>
                                <strong>⚠️ Database Syntax Error Signature:</strong> {log.sqlErrorEvidence}
                              </div>
                            )}

                            {(log.interceptedRequest || log.sampleResponseSnippet) && (
                              <details style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                <summary style={{ cursor: 'pointer', color: '#60a5fa' }}>Inspect Intercepted Wire Request & Response Payload</summary>
                                {log.interceptedRequest && (
                                  <div className={styles.inspectDetailsBox}>
                                    <div style={{ color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>Intercepted Request:</div>
                                    <pre style={{ margin: 0, color: '#38bdf8' }}>{log.interceptedRequest}</pre>
                                  </div>
                                )}
                                {log.sampleResponseSnippet && (
                                  <div className={styles.inspectDetailsBox}>
                                    <div style={{ color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>Server Response Snippet:</div>
                                    <pre style={{ margin: 0, color: log.fuzzResult === 'BYPASS_DETECTED' ? '#f87171' : '#f59e0b' }}>{log.sampleResponseSnippet}</pre>
                                  </div>
                                )}
                              </details>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Origin & IP Address Exposure Diagnostic */}
                  {scanResult.recon.ipExposure && (
                    <div 
                      className={styles.reconCard} 
                      style={{ 
                        gridColumn: '1 / -1',
                        borderColor: scanResult.recon.ipExposure.originIpLeaked ? 'rgba(239, 68, 68, 0.45)' : 'rgba(52, 211, 153, 0.3)',
                        background: scanResult.recon.ipExposure.originIpLeaked ? 'rgba(239, 68, 68, 0.04)' : 'rgba(15, 23, 42, 0.5)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                        <div className={styles.reconCardTitle} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: scanResult.recon.ipExposure.originIpLeaked ? '#f87171' : '#34d399', margin: 0 }}>
                          <Server size={18} />
                          Origin & Computer / Server IP Exposure Diagnostic
                        </div>
                        <div>
                          {scanResult.recon.ipExposure.originIpLeaked ? (
                            <span className={styles.reconTagDanger}>⚠️ ORIGIN IP EXPOSED (WAF BYPASS RISK)</span>
                          ) : (
                            <span className={styles.reconTagSuccess}>🛡️ SHIELDED BEHIND REVERSE PROXY</span>
                          )}
                        </div>
                      </div>

                      {/* Metric Bar */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                        <div style={{ background: 'rgba(2, 6, 23, 0.6)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Detected Server / Host IP</div>
                          <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.95rem', color: scanResult.recon.ipExposure.originIpLeaked ? '#f87171' : '#38bdf8' }}>
                            {scanResult.recon.ipExposure.detectedServerIp || 'Unresolved / Hidden'}
                          </div>
                        </div>
                        <div style={{ background: 'rgba(2, 6, 23, 0.6)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Proxy / Edge Shielding</div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#f1f5f9' }}>
                            {scanResult.recon.ipExposure.proxyProvider || 'Direct Origin Server'}
                          </div>
                        </div>
                        <div style={{ background: 'rgba(2, 6, 23, 0.6)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Network Defense Posture</div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: scanResult.recon.ipExposure.isBehindProxy ? '#34d399' : '#f59e0b' }}>
                            {scanResult.recon.ipExposure.isBehindProxy ? 'Protected by CDN/WAF' : 'Direct Public Internet Access'}
                          </div>
                        </div>
                      </div>

                      {/* Valid Technical Evidence */}
                      {scanResult.recon.ipExposure.evidence && (
                        <div style={{ background: 'rgba(2, 6, 23, 0.8)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '10px 14px', marginBottom: '10px' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                            Valid Technical Evidence & Network Analysis:
                          </div>
                          <div style={{ fontSize: '0.85rem', color: scanResult.recon.ipExposure.originIpLeaked ? '#fca5a5' : '#cbd5e1', lineHeight: 1.5 }}>
                            {scanResult.recon.ipExposure.evidence}
                          </div>
                        </div>
                      )}

                      {/* Disclosed IP Leak Vectors list */}
                      {scanResult.recon.ipExposure.leakVectors?.length > 0 && (
                        <div style={{ marginTop: '8px' }}>
                          <div style={{ fontSize: '0.75rem', color: '#f87171', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                            Discovered IP Exposure Vectors ({scanResult.recon.ipExposure.leakVectors.length}):
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {scanResult.recon.ipExposure.leakVectors.map((vec, vIdx) => (
                              <div key={vIdx} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '6px', padding: '6px 12px', fontSize: '0.8rem', color: '#fca5a5', fontFamily: 'monospace' }}>
                                <span>🚨</span>
                                <span>{vec}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Encrypted Media & Storage Audit */}
                  {scanResult.recon.mediaEncryption && (
                    <div 
                      className={styles.reconCard} 
                      style={{ 
                        gridColumn: '1 / -1',
                        borderColor: scanResult.recon.mediaEncryption.status === 'LEAK_DETECTED' ? 'rgba(239, 68, 68, 0.45)' : 'rgba(52, 211, 153, 0.3)',
                        background: scanResult.recon.mediaEncryption.status === 'LEAK_DETECTED' ? 'rgba(239, 68, 68, 0.04)' : 'rgba(15, 23, 42, 0.5)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                        <div className={styles.reconCardTitle} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: scanResult.recon.mediaEncryption.status === 'LEAK_DETECTED' ? '#f87171' : '#34d399', margin: 0 }}>
                          <HardDrive size={18} />
                          Encrypted Media & Storage Security Audit
                        </div>
                        <div>
                          {scanResult.recon.mediaEncryption.status === 'LEAK_DETECTED' ? (
                            <span className={styles.reconTagDanger}>⚡ ENCRYPTION LEAK DETECTED</span>
                          ) : (
                            <span className={styles.reconTagSuccess}>🔒 MEDIA STORAGE RESTRICTED / SECURE</span>
                          )}
                        </div>
                      </div>

                      {/* Valid Cryptographic Proof & Evidence */}
                      {scanResult.recon.mediaEncryption.evidence && (
                        <div style={{ background: 'rgba(2, 6, 23, 0.8)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                            Cryptographic Audit Proof & Findings:
                          </div>
                          <div style={{ fontSize: '0.85rem', color: scanResult.recon.mediaEncryption.status === 'LEAK_DETECTED' ? '#fca5a5' : '#cbd5e1', lineHeight: 1.5 }}>
                            {scanResult.recon.mediaEncryption.evidence}
                          </div>
                        </div>
                      )}

                      {/* Tested Media Paths */}
                      {scanResult.recon.mediaEncryption.testedPaths?.length > 0 && (
                        <div style={{ marginBottom: '10px' }}>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                            Tested Media & Storage Endpoints ({scanResult.recon.mediaEncryption.testedPaths.length}):
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {scanResult.recon.mediaEncryption.testedPaths.map((p, pIdx) => {
                              const isLeaked = scanResult.recon.mediaEncryption.leakedMedia?.some(m => m.path === p);
                              return (
                                <span 
                                  key={pIdx} 
                                  className={isLeaked ? styles.reconTagDanger : styles.reconTag}
                                  style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                                >
                                  {p} {isLeaked ? '• EXPOSED' : '• Protected'}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Leaked Media Details */}
                      {scanResult.recon.mediaEncryption.leakedMedia?.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                          <div style={{ fontSize: '0.75rem', color: '#f87171', fontWeight: 600, textTransform: 'uppercase' }}>
                            Compromised Media Buckets & Disclosures ({scanResult.recon.mediaEncryption.leakedMedia.length}):
                          </div>
                          {scanResult.recon.mediaEncryption.leakedMedia.map((m, mIdx) => (
                            <div key={mIdx} style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '8px', padding: '10px 12px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#f87171' }}>{m.path} (HTTP {m.status})</span>
                                <span className={styles.reconTagDanger}>{m.issue}</span>
                              </div>
                              <div style={{ fontSize: '0.8rem', color: '#fca5a5' }}>
                                <strong>Evidence:</strong> {m.evidence}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Headless Browser & Rotating IP Proxy Telemetry (Puppeteer) */}
                  {scanResult.recon.puppeteerAudit && (
                    <div 
                      className={styles.reconCard} 
                      style={{ 
                        gridColumn: '1 / -1',
                        borderColor: scanResult.recon.puppeteerAudit.executed ? 'rgba(56, 189, 248, 0.4)' : 'rgba(245, 158, 11, 0.3)',
                        background: 'rgba(15, 23, 42, 0.55)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                        <div className={styles.reconCardTitle} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', margin: 0 }}>
                          <Cpu size={18} />
                          Headless Browser & Rotating IP Proxy Telemetry (Puppeteer Engine)
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <span className={scanResult.recon.puppeteerAudit.executed ? styles.reconTagSuccess : styles.reconTagWarning}>
                            {scanResult.recon.puppeteerAudit.executed ? 'Puppeteer: Active & Audited' : 'Puppeteer: Bypassed / Fallback'}
                          </span>
                          {scanResult.recon.puppeteerAudit.fallbackTriggered && (
                            <span className={styles.reconTagWarning}>🛡️ Auto-Fallback Triggered</span>
                          )}
                        </div>
                      </div>

                      {/* Metric Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                        <div style={{ background: 'rgba(2, 6, 23, 0.6)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Active Egress Proxy Routing</div>
                          <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.85rem', color: '#fbbf24' }}>
                            {scanResult.recon.puppeteerAudit.proxyUsed || 'Direct (No Proxy)'}
                          </div>
                        </div>
                        <div style={{ background: 'rgba(2, 6, 23, 0.6)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>WebRTC STUN Candidate Leaks</div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: scanResult.recon.puppeteerAudit.webrtcLeakedIps?.length > 0 ? '#f87171' : '#34d399' }}>
                            {scanResult.recon.puppeteerAudit.webrtcLeakedIps?.length > 0 
                              ? `${scanResult.recon.puppeteerAudit.webrtcLeakedIps.length} Computer IP(s) Exposed` 
                              : 'No WebRTC STUN Leaks Detected'}
                          </div>
                        </div>
                        <div style={{ background: 'rgba(2, 6, 23, 0.6)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>DOM Media & Client Secrets</div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: (scanResult.recon.puppeteerAudit.clientStorageSecrets?.length > 0 || scanResult.recon.puppeteerAudit.domMediaDiscovered?.length > 0) ? '#fbbf24' : '#cbd5e1' }}>
                            {scanResult.recon.puppeteerAudit.domMediaDiscovered?.length || 0} Media • {scanResult.recon.puppeteerAudit.clientStorageSecrets?.length || 0} Storage Keys
                          </div>
                        </div>
                      </div>

                      {/* Note & Fallback Status */}
                      {scanResult.recon.puppeteerAudit.note && (
                        <div style={{ background: 'rgba(2, 6, 23, 0.75)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '10px 14px', marginBottom: '10px', fontSize: '0.85rem', color: '#94a3b8' }}>
                          <strong>Execution Status:</strong> {scanResult.recon.puppeteerAudit.note}
                        </div>
                      )}

                      {/* WebRTC Leaked IPs Details */}
                      {scanResult.recon.puppeteerAudit.webrtcLeakedIps?.length > 0 && (
                        <div style={{ marginBottom: '10px' }}>
                          <div style={{ fontSize: '0.75rem', color: '#f87171', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                            WebRTC STUN Leaked Computer IPs ({scanResult.recon.puppeteerAudit.webrtcLeakedIps.length}):
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {scanResult.recon.puppeteerAudit.webrtcLeakedIps.map((ip, ipIdx) => (
                              <span key={ipIdx} className={styles.reconTagDanger} style={{ fontFamily: 'monospace' }}>
                                🚨 {ip} (Disclosed via RTCPeerConnection)
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Client Storage Secrets */}
                      {scanResult.recon.puppeteerAudit.clientStorageSecrets?.length > 0 && (
                        <div style={{ marginBottom: '10px' }}>
                          <div style={{ fontSize: '0.75rem', color: '#fbbf24', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                            Extracted Client Storage Secrets (localStorage / sessionStorage):
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {scanResult.recon.puppeteerAudit.clientStorageSecrets.map((sec, sIdx) => (
                              <div key={sIdx} style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '6px', padding: '6px 10px', fontFamily: 'monospace', fontSize: '0.8rem', color: '#fde68a' }}>
                                {sec}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Visual Proof Screenshot Preview */}
                      {scanResult.recon.puppeteerAudit.screenshotProof && (
                        <details style={{ marginTop: '10px' }}>
                          <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: '#38bdf8', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <Camera size={16} /> View Puppeteer Live Render Screenshot Proof
                          </summary>
                          <div className={styles.screenshotContainer}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img 
                              src={scanResult.recon.puppeteerAudit.screenshotProof} 
                              alt="Puppeteer Audit Screenshot Proof" 
                              className={styles.screenshotImg}
                            />
                          </div>
                        </details>
                      )}
                    </div>
                  )}

                  {scanResult.recon.technologies?.length > 0 && (
                    <div className={styles.reconCard}>
                      <div className={styles.reconCardTitle}>Identified Technologies</div>
                      <div className={styles.reconTagList}>
                        {scanResult.recon.technologies.map((t, i) => (
                          <span key={i} className={styles.reconTag}>{t}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {scanResult.recon.missingSecurityHeaders?.length > 0 && (
                    <div className={styles.reconCard}>
                      <div className={styles.reconCardTitle}>Missing Defensive Headers</div>
                      <div className={styles.reconTagList}>
                        {scanResult.recon.missingSecurityHeaders.map((h, i) => (
                          <span key={i} className={`${styles.reconTag} ${styles.reconTagWarning}`}>{h}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Account Takeover Assessment (ATO Evaluation Suite) */}
              {scanResult.accountTakeoverAssessment && (
                <AccountTakeoverAssessmentCard assessment={scanResult.accountTakeoverAssessment} />
              )}

              {/* Toolbar */}
              <div className={styles.toolbar}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ position: 'relative', minWidth: '220px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      placeholder="Search findings..."
                      className={styles.textInput}
                      style={{ padding: '8px 12px 8px 34px', fontSize: '0.85rem' }}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '4px', background: 'rgba(15,23,42,0.6)', padding: '4px', borderRadius: '8px' }}>
                    {['all', 'critical', 'high', 'medium', 'low'].map((sev) => (
                      <button
                        key={sev}
                        type="button"
                        style={{
                          padding: '4px 10px',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          cursor: 'pointer',
                          background: severityFilter === sev ? 'rgba(239,68,68,0.25)' : 'transparent',
                          color: severityFilter === sev ? '#f87171' : 'var(--text-muted)',
                        }}
                        onClick={() => setSeverityFilter(sev)}
                      >
                        {sev}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.exportGroup}>
                  <button type="button" className={styles.exportBtn} onClick={downloadSARIF}>
                    <ShieldAlert size={14} /> SARIF 2.1.0
                  </button>
                  <button type="button" className={styles.exportBtn} onClick={downloadJSON}>
                    <Download size={14} /> JSON
                  </button>
                  <button type="button" className={styles.exportBtn} onClick={() => window.print()}>
                    <Printer size={14} /> Print / PDF
                  </button>
                  <button
                    type="button"
                    className={styles.deleteToolbarBtn}
                    onClick={() => setItemToDelete(scanResult)}
                    title="Hapus audit ini"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </div>

              {/* Findings */}
              <div className={styles.findingsSection}>
                <div className={styles.findingsHeader}>
                  <h3 className={styles.findingsTitle}>
                    Discovered Vulnerabilities ({filteredVulns.length})
                  </h3>
                </div>

                {filteredVulns.map((vuln, index) => {
                  const vulnKey = vuln.id || index;
                  const isExpanded = !!expandedVulns[vulnKey];

                  let sevClass = styles.badgeLow;
                  const sevLower = (vuln.severity || 'low').toLowerCase();
                  if (sevLower === 'critical') sevClass = styles.badgeCrit;
                  else if (sevLower === 'high') sevClass = styles.badgeHigh;
                  else if (sevLower === 'medium') sevClass = styles.badgeMed;

                  return (
                    <div key={vulnKey} className={styles.vulnCard}>
                      <div className={styles.vulnCardHeader} onClick={() => toggleVuln(vulnKey)}>
                        <div className={styles.vulnTitleGroup}>
                          <span className={sevClass}>{vuln.severity}</span>
                          <span className={styles.cvssPill}>CVSS {vuln.cvss || 'N/A'}</span>
                          <span className={styles.vulnTitle}>{vuln.title}</span>
                        </div>

                        <div className={styles.vulnMetaPills}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {vuln.owaspCategory?.split(' ')[0] || vuln.cwe}
                          </span>
                          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className={styles.vulnBody}>
                          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            {vuln.cwe && <span><strong>CWE:</strong> {vuln.cwe}</span>}
                            {vuln.endpoint && <span><strong>Endpoint:</strong> {vuln.endpoint}</span>}
                          </div>

                          <div className={styles.vulnSection}>
                            <div className={styles.vulnSectionTitle}>Description</div>
                            <div className={styles.vulnSectionText}>{vuln.description}</div>
                          </div>

                          {vuln.impact && (
                            <div className={styles.vulnSection}>
                              <div className={styles.vulnSectionTitle}>Business & Technical Impact</div>
                              <div className={styles.vulnSectionText}>{vuln.impact}</div>
                            </div>
                          )}

                          {vuln.pocScriptCode && (
                            <div className={styles.vulnSection}>
                              <div className={styles.vulnSectionTitle}>Validated Proof-of-Concept Exploit (PoC)</div>
                              <div className={styles.codeBlock}>
                                <button
                                  type="button"
                                  className={styles.copyCodeBtn}
                                  onClick={() => handleCopy(vuln.pocScriptCode, `poc_${vulnKey}`)}
                                >
                                  {copiedId === `poc_${vulnKey}` ? <Check size={14} /> : <Copy size={14} />}
                                  {copiedId === `poc_${vulnKey}` ? 'Copied!' : 'Copy Exploit'}
                                </button>
                                <pre>{vuln.pocScriptCode}</pre>
                              </div>
                            </div>
                          )}

                          {/* Data Leakage & Exposed Information Card */}
                          {vuln.dataLeakage && (
                            <div className={styles.leakageCard}>
                              <div className={styles.leakageCardTitle}>
                                <Database size={16} />
                                Informasi & Data Yang Dapat Bocor (Exposed Data Analysis)
                              </div>
                              {vuln.dataLeakage.impactDescription && (
                                <p style={{ fontSize: '0.85rem', color: '#fca5a5', marginBottom: '8px' }}>
                                  {vuln.dataLeakage.impactDescription}
                                </p>
                              )}

                              {vuln.dataLeakage.leakedTypes?.length > 0 && (
                                <div className={styles.leakedTypesList}>
                                  {vuln.dataLeakage.leakedTypes.map((type, tIdx) => (
                                    <span key={tIdx} className={styles.leakedTypeBadge}>
                                      <AlertTriangle size={12} /> {type}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {vuln.dataLeakage.exposedSample && (
                                <div style={{ marginTop: '10px' }}>
                                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f87171', marginBottom: '4px' }}>
                                    Simulasi / Contoh Struktur Data Bocor (Leaked Data Content):
                                  </div>
                                  <div className={styles.codeBlock} style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}>
                                    <button
                                      type="button"
                                      className={styles.copyCodeBtn}
                                      onClick={() => handleCopy(vuln.dataLeakage.exposedSample, `leak_${vulnKey}`)}
                                    >
                                      {copiedId === `leak_${vulnKey}` ? <Check size={14} /> : <Copy size={14} />}
                                      {copiedId === `leak_${vulnKey}` ? 'Copied!' : 'Copy Data'}
                                    </button>
                                    <pre style={{ color: '#fca5a5' }}>{vuln.dataLeakage.exposedSample}</pre>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Developer Debugging & Bypass Trace */}
                          {(vuln.debuggingInfo || vuln.bypassDetails) && (
                            <div className={styles.debugCard}>
                              <div className={styles.debugCardTitle}>
                                <Bug size={16} />
                                Developer Debugging & Bypass Mechanics Trace
                              </div>

                              {vuln.debuggingInfo?.rootCauseTrigger && (
                                <div style={{ marginBottom: '10px', fontSize: '0.85rem' }}>
                                  <strong style={{ color: '#38bdf8' }}>Root Cause Parameter / Trigger: </strong>
                                  <code style={{ color: '#fbbf24', background: 'rgba(0,0,0,0.4)', padding: '2px 6px', borderRadius: '4px' }}>
                                    {vuln.debuggingInfo.rootCauseTrigger}
                                  </code>
                                </div>
                              )}

                              {vuln.bypassDetails?.mechanism && (
                                <div style={{ marginBottom: '10px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                  <strong style={{ color: '#38bdf8' }}>Bypass Mechanism: </strong>
                                  {vuln.bypassDetails.mechanism}
                                </div>
                              )}

                              {vuln.bypassDetails?.bypassedControls?.length > 0 && (
                                <div style={{ marginBottom: '10px' }}>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                    Bypassed Defense Layers:
                                  </div>
                                  <div className={styles.bypassedPills}>
                                    {vuln.bypassDetails.bypassedControls.map((ctrl, cIdx) => (
                                      <span key={cIdx} className={styles.bypassedPill}>
                                        <Layers size={12} /> {ctrl}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {vuln.debuggingInfo?.executionFlow?.length > 0 && (
                                <div style={{ marginTop: '12px' }}>
                                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#38bdf8', marginBottom: '6px' }}>
                                    Execution Flow Timeline (Call Stack Analysis):
                                  </div>
                                  <div className={styles.executionTimeline}>
                                    {vuln.debuggingInfo.executionFlow.map((step, sIdx) => (
                                      <div key={sIdx} className={styles.executionStep}>
                                        {step}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {vuln.debuggingInfo?.serverErrorSignature && (
                                <div style={{ marginTop: '10px', fontSize: '0.8rem' }}>
                                  <span style={{ color: '#f59e0b', fontWeight: 600 }}>Observed Server / Error Signature: </span>
                                  <code style={{ color: '#fca5a5' }}>{vuln.debuggingInfo.serverErrorSignature}</code>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Remediation & Code Patch */}
                          {(vuln.remediation || vuln.remediationPatch) && (
                            <div className={styles.vulnSection}>
                              <div className={styles.vulnSectionTitle}>Remediation & Patch</div>
                              {vuln.remediation && (
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                  {vuln.remediation}
                                </p>
                              )}
                              {vuln.developerGuidance?.checklist?.length > 0 && (
                                <div style={{ marginTop: '10px', marginBottom: '12px' }}>
                                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#34d399', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <ListChecks size={14} /> Developer Fix Checklist:
                                  </div>
                                  <div className={styles.developerChecklist}>
                                    {vuln.developerGuidance.checklist.map((item, chIdx) => (
                                      <div key={chIdx} className={styles.checklistItem}>
                                        <Check size={14} />
                                        <span>{item}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {vuln.remediationPatch && (
                                <div className={styles.codeBlock} style={{ borderColor: 'rgba(52, 211, 153, 0.3)' }}>
                                  <button
                                    type="button"
                                    className={styles.copyCodeBtn}
                                    onClick={() => handleCopy(vuln.remediationPatch, `patch_${vulnKey}`)}
                                  >
                                    {copiedId === `patch_${vulnKey}` ? <Check size={14} /> : <Copy size={14} />}
                                    {copiedId === `patch_${vulnKey}` ? 'Copied!' : 'Copy Patch'}
                                  </button>
                                  <pre style={{ color: '#6ee7b7' }}>{vuln.remediationPatch}</pre>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )
        )}

        {/* Delete Confirmation Modal */}
        <DeleteConfirmModal
          isOpen={!!itemToDelete}
          onClose={() => setItemToDelete(null)}
          onConfirm={handleDeleteConfirm}
          isDeleting={isDeleting}
          item={itemToDelete}
        />

        {/* Toast Notification */}
        {toast && (
          <div
            className={`${styles.strixToast} ${
              toast.type === 'success'
                ? styles.strixToastSuccess
                : toast.type === 'error'
                ? styles.strixToastError
                : styles.strixToastInfo
            }`}
          >
            {toast.msg}
          </div>
        )}
      </div>
    </>
  );
}

