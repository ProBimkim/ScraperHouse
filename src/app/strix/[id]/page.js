'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
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
  Shield
} from 'lucide-react';

export default function StrixDetailPage({ params }) {
  const { id } = use(params);

  const [scanResult, setScanResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [severityFilter, setSeverityFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedVulns, setExpandedVulns] = useState({});
  const [copiedId, setCopiedId] = useState(null);

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
                          </div>
                        ))}
                      </div>
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

                          {vuln.remediation && (
                            <div className={styles.vulnSection}>
                              <div className={styles.vulnSectionTitle}>Remediation & Patch</div>
                              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                {vuln.remediation}
                              </p>
                              {vuln.remediationPatch && (
                                <div className={styles.codeBlock} style={{ borderColor: 'rgba(52, 211, 153, 0.3)' }}>
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
      </div>
    </>
  );
}
