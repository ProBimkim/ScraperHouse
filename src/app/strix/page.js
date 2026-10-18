'use client';

import { useState, useEffect, useRef } from 'react';
import Navbar from '@/components/Navbar';
import styles from './page.module.css';
import { 
  ShieldAlert, 
  Globe, 
  GitBranch, 
  Code, 
  Sliders, 
  Play, 
  History, 
  Download, 
  Copy, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  AlertTriangle, 
  Terminal, 
  FileCode, 
  ExternalLink,
  Printer,
  RefreshCw,
  Search,
  X,
  Key,
  Lock,
  Shield,
  Trash2
} from 'lucide-react';
import DeleteConfirmModal from '@/components/DeleteConfirmModal';


export default function StrixPentestPage() {
  // Tabs & Target input
  const [activeTab, setActiveTab] = useState('url'); // 'url' | 'repo' | 'code'
  const [targetInput, setTargetInput] = useState('');
  const [codeSnippet, setCodeSnippet] = useState('');
  
  // Advanced settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [scanMode, setScanMode] = useState('standard');
  const [instruction, setInstruction] = useState('');
  const [customGroqKey, setCustomGroqKey] = useState('');
  const [customGithubToken, setCustomGithubToken] = useState('');

  // Execution & Progress state
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [scanLogs, setScanLogs] = useState([]);
  const [scanResult, setScanResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // UI filters & view
  const [severityFilter, setSeverityFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedVulns, setExpandedVulns] = useState({});
  const [copiedId, setCopiedId] = useState(null);

  // History modal
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyList, setHistoryList] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Deletion state
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isDeletingAudit, setIsDeletingAudit] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Auto-scroll terminal logs
  const logsEndRef = useRef(null);
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scanLogs]);

  // Handle starting a scan
  const handleStartScan = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');

    const targetVal = targetInput.trim();
    if (activeTab !== 'code' && !targetVal) {
      setErrorMsg('Please enter a target URL or GitHub repository.');
      return;
    }
    if (activeTab === 'code' && !codeSnippet.trim()) {
      setErrorMsg('Please paste the source code or specification to audit.');
      return;
    }

    setIsScanning(true);
    setScanProgress(5);
    setStatusMessage('Initiating Strix AI Pentesting engine...');
    setScanLogs([{ time: new Date().toLocaleTimeString(), text: 'Initializing Strix Autonomous Engine...' }]);
    setScanResult(null);

    try {
      const response = await fetch('/api/strix/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: activeTab,
          target: targetVal,
          codeSnippet: codeSnippet.trim(),
          scanMode,
          instruction: instruction.trim(),
          groqApiKey: customGroqKey.trim(),
          githubToken: customGithubToken.trim(),
          stream: true,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Scan failed with status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop(); // keep remainder

        for (const block of lines) {
          if (!block.trim()) continue;
          const eventMatch = block.match(/^event: (.*)$/m);
          const dataMatch = block.match(/^data: (.*)$/m);

          if (eventMatch && dataMatch) {
            const eventType = eventMatch[1].trim();
            let parsedData;
            try {
              parsedData = JSON.parse(dataMatch[1]);
            } catch {
              continue;
            }

            if (eventType === 'status') {
              if (parsedData.progress) setScanProgress(parsedData.progress);
              if (parsedData.message) {
                setStatusMessage(parsedData.message);
                setScanLogs((prev) => [
                  ...prev,
                  { time: new Date().toLocaleTimeString(), text: parsedData.message }
                ]);
              }
            } else if (eventType === 'complete') {
              setScanProgress(100);
              setStatusMessage('Security audit completed!');
              setScanResult(parsedData);
              // auto expand critical & high vulnerabilities
              const expandInit = {};
              (parsedData.vulnerabilities || []).forEach((v, idx) => {
                if (v.severity === 'critical' || v.severity === 'high' || idx === 0) {
                  expandInit[v.id || idx] = true;
                }
              });
              setExpandedVulns(expandInit);
              setIsScanning(false);
            } else if (eventType === 'error') {
              throw new Error(parsedData.message || 'An error occurred during security scan.');
            }
          }
        }
      }
    } catch (err) {
      console.error('Scan error:', err);
      setErrorMsg(err.message || 'Scan failed to execute.');
      setIsScanning(false);
    }
  };

  // Toggle vulnerability expansion
  const toggleVuln = (id) => {
    setExpandedVulns((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Copy helper
  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Fetch history list
  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch('/api/strix/history');
      const data = await res.json();
      if (Array.isArray(data)) {
        setHistoryList(data);
      }
    } catch (e) {
      console.error('Failed to fetch history:', e);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const openHistoryModal = () => {
    setShowHistoryModal(true);
    fetchHistory();
  };

  // Load past scan
  const loadScanFromHistory = async (slug) => {
    setShowHistoryModal(false);
    setIsScanning(true);
    setStatusMessage('Loading audit report from database...');
    try {
      const res = await fetch(`/api/strix/${slug}`);
      if (!res.ok) throw new Error('Failed to load scan');
      const data = await res.json();
      setScanResult(data);
      setActiveTab(data.targetType || 'url');
      setTargetInput(data.target || '');
      const expandInit = {};
      (data.vulnerabilities || []).forEach((v, idx) => {
        if (v.severity === 'critical' || v.severity === 'high' || idx === 0) {
          expandInit[v.id || idx] = true;
        }
      });
      setExpandedVulns(expandInit);
    } catch (err) {
      setErrorMsg(`Could not load report: ${err.message}`);
    } finally {
      setIsScanning(false);
    }
  };

  // Delete handlers
  const promptDeleteAudit = (item) => {
    setItemToDelete(item);
  };

  const handleDeleteConfirm = async (password) => {
    if (!itemToDelete) return;
    setIsDeletingAudit(true);
    try {
      const slugOrId = itemToDelete.slug || itemToDelete._id;
      const res = await fetch(`/api/strix/${slugOrId}?password=${encodeURIComponent(password)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setHistoryList((prev) => prev.filter((h) => h.slug !== itemToDelete.slug && h._id !== itemToDelete._id));
        if (scanResult && (scanResult.slug === itemToDelete.slug || scanResult._id === itemToDelete._id)) {
          setScanResult(null);
        }
        showToast('Audit report deleted successfully.', 'success');
        setItemToDelete(null);
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to delete audit. Please check your password.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Error deleting audit.', 'error');
    } finally {
      setIsDeletingAudit(false);
    }
  };

  // Export handlers
  const downloadJSON = () => {
    if (!scanResult) return;
    const blob = new Blob([JSON.stringify(scanResult.vulnerabilities || [], null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vulnerabilities_${scanResult.slug || 'strix'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadSARIF = () => {
    if (!scanResult?.sarif) return;
    const blob = new Blob([JSON.stringify(scanResult.sarif, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `findings_${scanResult.slug || 'strix'}.sarif`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadMarkdownReport = () => {
    if (!scanResult) return;
    let md = `# Security Penetration Test Report — Strix AI\n\n`;
    md += `**Target:** ${scanResult.target}\n`;
    md += `**Target Type:** ${scanResult.targetType?.toUpperCase()}\n`;
    md += `**Scan Mode:** ${scanResult.scanMode?.toUpperCase()}\n`;
    md += `**Date:** ${new Date().toISOString()}\n`;
    md += `**Risk Rating:** ${scanResult.summary?.riskRating} (Score: ${scanResult.summary?.riskScore}/100)\n\n`;
    md += `## Executive Summary\n\n${scanResult.executiveSummary}\n\n`;
    md += `## Vulnerability Findings\n\n`;

    (scanResult.vulnerabilities || []).forEach((v) => {
      md += `### [${v.severity?.toUpperCase()}] ${v.title}\n`;
      md += `- **ID:** ${v.id}\n`;
      md += `- **OWASP:** ${v.owaspCategory}\n`;
      md += `- **CWE:** ${v.cwe}\n`;
      md += `- **CVSS:** ${v.cvss}\n`;
      md += `- **Endpoint:** ${v.endpoint || 'N/A'}\n\n`;
      md += `#### Description\n${v.description}\n\n`;
      md += `#### Business Impact\n${v.impact}\n\n`;
      if (v.pocScriptCode) {
        md += `#### Proof of Concept (PoC)\n\`\`\`python\n${v.pocScriptCode}\n\`\`\`\n\n`;
      }
      if (v.remediation) {
        md += `#### Remediation\n${v.remediation}\n\n`;
      }
      if (v.remediationPatch) {
        md += `#### Code Patch\n\`\`\`javascript\n${v.remediationPatch}\n\`\`\`\n\n`;
      }
      md += `---\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `penetration_test_report_${scanResult.slug || 'strix'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter vulnerabilities
  const filteredVulns = (scanResult?.vulnerabilities || []).filter((v) => {
    if (severityFilter !== 'all' && v.severity?.toLowerCase() !== severityFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = v.title?.toLowerCase().includes(q);
      const matchCwe = v.cwe?.toLowerCase().includes(q);
      const matchOwasp = v.owaspCategory?.toLowerCase().includes(q);
      const matchDesc = v.description?.toLowerCase().includes(q);
      return matchTitle || matchCwe || matchOwasp || matchDesc;
    }
    return true;
  });

  return (
    <>
      <Navbar />
      <div className={styles.strixContainer}>
        {/* Hero Section */}
        <div className={styles.heroHeader}>
          <div className={styles.heroBadge}>
            <ShieldAlert size={14} />
            Autonomous AI Pentesting Engine
          </div>
          <h1 className={styles.heroTitle}>
            Strix <span className={styles.heroTitleHighlight}>Security Audit</span>
          </h1>
          <p className={styles.heroSubtitle}>
            Autonomous AI penetration testing agents that dynamically evaluate your live web applications,
            APIs, and GitHub repositories against OWASP Top 10:2025 with validated Proof-of-Concepts and SARIF reports.
          </p>
        </div>

        {/* Scanner Form Card */}
        <div className={styles.scannerCard}>
          {/* Target Tabs */}
          <div className={styles.tabsList}>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'url' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('url')}
            >
              <Globe size={18} />
              Live Web Target / API
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'repo' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('repo')}
            >
              <GitBranch size={18} />
              GitHub Repository
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'code' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('code')}
            >
              <Code size={18} />
              Source Code / Spec
            </button>
          </div>

          <form onSubmit={handleStartScan}>
            {activeTab !== 'code' ? (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  {activeTab === 'url' ? 'Target URL or API Endpoint' : 'GitHub Repository URL'}
                </label>
                <div className={styles.inputWrapper}>
                  {activeTab === 'url' ? (
                    <Globe size={20} className={styles.inputIcon} />
                  ) : (
                    <GitBranch size={20} className={styles.inputIcon} />
                  )}
                  <input
                    type="text"
                    className={styles.textInput}
                    placeholder={
                      activeTab === 'url'
                        ? 'https://example.com or https://api.staging.com'
                        : 'https://github.com/owner/repository'
                    }
                    value={targetInput}
                    onChange={(e) => setTargetInput(e.target.value)}
                    disabled={isScanning}
                  />
                </div>
              </div>
            ) : (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Code Snippet, API Spec, or Configuration</label>
                <textarea
                  className={styles.codeTextarea}
                  placeholder={`// Paste your JavaScript/TypeScript route, Python handler, SQL query, or OpenAPI spec here...\n\napp.post('/api/login', async (req, res) => {\n  const user = await db.query("SELECT * FROM users WHERE email = '" + req.body.email + "'");\n  ...\n});`}
                  value={codeSnippet}
                  onChange={(e) => setCodeSnippet(e.target.value)}
                  disabled={isScanning}
                />
              </div>
            )}

            {/* Advanced Settings Toggle */}
            <button
              type="button"
              className={styles.settingsToggle}
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <Sliders size={16} />
              {showAdvanced ? 'Hide Advanced Options' : 'Show Advanced Options (Scope, Mode, API Keys)'}
              {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {/* Advanced Box */}
            {showAdvanced && (
              <div className={styles.advancedBox}>
                <div>
                  <label className={styles.formLabel}>Scan Intensity Mode</label>
                  <select
                    className={styles.selectInput}
                    value={scanMode}
                    onChange={(e) => setScanMode(e.target.value)}
                    disabled={isScanning}
                  >
                    <option value="quick">Quick Recon (Fast header & surface check)</option>
                    <option value="standard">Standard Pentest (OWASP Top 10 + PoCs)</option>
                    <option value="deep">Deep Autonomous Audit (Exhaustive Exploitation)</option>
                  </select>
                </div>

                <div>
                  <label className={styles.formLabel}>Scope Instructions & Focus</label>
                  <input
                    type="text"
                    className={styles.textInput}
                    style={{ paddingLeft: '14px' }}
                    placeholder='e.g. "Focus on SQLi & IDOR in /api/v1, test credentials user:pass"'
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    disabled={isScanning}
                  />
                </div>

                <div>
                  <label className={styles.formLabel}>Custom Groq API Key (Optional)</label>
                  <input
                    type="password"
                    className={styles.textInput}
                    style={{ paddingLeft: '14px' }}
                    placeholder="gsk_... (Defaults to system env)"
                    value={customGroqKey}
                    onChange={(e) => setCustomGroqKey(e.target.value)}
                    disabled={isScanning}
                  />
                </div>

                {activeTab === 'repo' && (
                  <div>
                    <label className={styles.formLabel}>GitHub Token (Optional)</label>
                    <input
                      type="password"
                      className={styles.textInput}
                      style={{ paddingLeft: '14px' }}
                      placeholder="ghp_... (Higher rate limits & private repos)"
                      value={customGithubToken}
                      onChange={(e) => setCustomGithubToken(e.target.value)}
                      disabled={isScanning}
                    />
                  </div>
                )}
              </div>
            )}

            {errorMsg && (
              <div style={{ color: '#f87171', fontSize: '0.9rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={16} />
                {errorMsg}
              </div>
            )}

            {/* Submit & History Actions */}
            <div className={styles.submitBar}>
              <button
                type="button"
                className={styles.historyBtn}
                onClick={openHistoryModal}
                disabled={isScanning}
              >
                <History size={16} />
                Audit History
              </button>

              <button
                type="submit"
                className={styles.launchBtn}
                disabled={isScanning}
              >
                {isScanning ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    Auditing Target... ({scanProgress}%)
                  </>
                ) : (
                  <>
                    <Play size={18} />
                    Launch Autonomous Pentest
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Real-time Progress & Terminal */}
        {isScanning && (
          <div className={styles.progressCard}>
            <div className={styles.progressHeader}>
              <div className={styles.progressStatus}>
                <Terminal size={20} />
                <span>{statusMessage}</span>
              </div>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f87171' }}>
                {scanProgress}%
              </span>
            </div>

            <div className={styles.progressBarTrack}>
              <div className={styles.progressBarFill} style={{ width: `${scanProgress}%` }} />
            </div>

            <div className={styles.terminalLogs}>
              {scanLogs.map((log, index) => (
                <div key={index} className={styles.terminalLine}>
                  <span className={styles.terminalTimestamp}>[{log.time}]</span>
                  <span>{log.text}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* Scan Results View */}
        {scanResult && !isScanning && (
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

                {scanResult.recon.probedEndpoints?.filter(p => p.accessible).length > 0 && (
                  <div className={styles.reconCard}>
                    <div className={styles.reconCardTitle}>Accessible Sensitive Endpoints</div>
                    <div className={styles.reconTagList}>
                      {scanResult.recon.probedEndpoints.filter(p => p.accessible).map((p, i) => (
                        <span key={i} className={`${styles.reconTag} ${styles.reconTagWarning}`}>
                          {p.path} (HTTP {p.status})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Toolbar: Search, Filters, and Export Actions */}
            <div className={styles.toolbar}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', minWidth: '220px' }}>
                  <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Search vulnerabilities..."
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
                <button type="button" className={styles.exportBtn} onClick={downloadMarkdownReport}>
                  <Download size={14} /> Markdown
                </button>
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
                  onClick={() => promptDeleteAudit(scanResult)}
                  title="Hapus hasil audit ini"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>

            {/* Findings Accordion List */}
            <div className={styles.findingsSection}>
              <div className={styles.findingsHeader}>
                <h3 className={styles.findingsTitle}>
                  Validated Vulnerabilities ({filteredVulns.length})
                </h3>
              </div>

              {filteredVulns.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No vulnerabilities match the current filter.
                </div>
              ) : (
                filteredVulns.map((vuln, index) => {
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
                            {vuln.cve && vuln.cve !== 'N/A' && <span><strong>CVE:</strong> {vuln.cve}</span>}
                            {vuln.endpoint && <span><strong>Endpoint:</strong> {vuln.endpoint}</span>}
                            {vuln.target && <span><strong>Target:</strong> {vuln.target}</span>}
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

                          {vuln.evidence && (
                            <div className={styles.vulnSection}>
                              <div className={styles.vulnSectionTitle}>Discovered Evidence & Analysis</div>
                              <div className={styles.vulnSectionText}>{vuln.evidence}</div>
                            </div>
                          )}

                          {/* Proof of Concept (PoC) Script */}
                          {vuln.pocScriptCode && (
                            <div className={styles.vulnSection}>
                              <div className={styles.vulnSectionTitle}>
                                Validated Proof-of-Concept Exploit (PoC)
                              </div>
                              {vuln.pocDescription && (
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                  {vuln.pocDescription}
                                </p>
                              )}
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

                          {/* Remediation & Code Patch */}
                          {(vuln.remediation || vuln.remediationPatch) && (
                            <div className={styles.vulnSection}>
                              <div className={styles.vulnSectionTitle}>Remediation & Patch</div>
                              {vuln.remediation && (
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                  {vuln.remediation}
                                </p>
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

                          {/* References */}
                          {vuln.references?.length > 0 && (
                            <div className={styles.vulnSection}>
                              <div className={styles.vulnSectionTitle}>Advisory References</div>
                              <ul style={{ paddingLeft: '20px', fontSize: '0.85rem' }}>
                                {vuln.references.map((ref, rIdx) => (
                                  <li key={rIdx}>
                                    <a href={ref} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                      {ref} <ExternalLink size={12} />
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* History Modal */}
        {showHistoryModal && (
          <div className={styles.modalOverlay} onClick={() => setShowHistoryModal(false)}>
            <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <History size={18} />
                  Previous Security Audits
                </h3>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  onClick={() => setShowHistoryModal(false)}
                >
                  <X size={20} />
                </button>
              </div>

              <div className={styles.modalBody}>
                {isLoadingHistory ? (
                  <div style={{ textAlign: 'center', padding: '30px' }}>Loading past scans...</div>
                ) : historyList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                    No audit history found yet.
                  </div>
                ) : (
                  historyList.map((item) => (
                    <div
                      key={item.slug}
                      className={styles.historyItem}
                      onClick={() => loadScanFromHistory(item.slug)}
                    >
                      <div style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-main)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.target}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {new Date(item.createdAt).toLocaleString()} • {item.scanMode?.toUpperCase()} • {item.summary?.totalVulnerabilities || 0} findings
                        </div>
                      </div>

                      <div className={styles.historyItemRight}>
                        <span
                          className={
                            item.summary?.riskRating === 'CRITICAL'
                              ? styles.badgeCrit
                              : item.summary?.riskRating === 'HIGH'
                              ? styles.badgeHigh
                              : item.summary?.riskRating === 'MEDIUM'
                              ? styles.badgeMed
                              : styles.badgeLow
                          }
                        >
                          {item.summary?.riskRating || 'AUDITED'}
                        </span>

                        <button
                          type="button"
                          className={styles.deleteAuditBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            promptDeleteAudit(item);
                          }}
                          title="Hapus audit ini"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        <DeleteConfirmModal
          isOpen={!!itemToDelete}
          onClose={() => setItemToDelete(null)}
          onConfirm={handleDeleteConfirm}
          isDeleting={isDeletingAudit}
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

