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
  Trash2,
  Database,
  Bug,
  Layers,
  ListChecks,
  Server,
  HardDrive,
  Cpu,
  Camera,
  Activity,
  Zap,
  Gauge,
  StopCircle,
  Clock,
  TrendingUp,
  BarChart2,
  CheckCircle2,
  XCircle,
  AlertCircle
} from 'lucide-react';
import DeleteConfirmModal from '@/components/DeleteConfirmModal';
import StressReportView from '@/components/strix/StressReportView';
import ChaosMeshSuiteView from '@/components/strix/ChaosMeshSuiteView';
import VulnerabilityStressImpactCard from '@/components/strix/VulnerabilityStressImpactCard';
import AccountTakeoverAssessmentCard from '@/components/strix/AccountTakeoverAssessmentCard';


export default function StrixPentestPage() {
  // Tabs & Target input
  const [activeTab, setActiveTab] = useState('url'); // 'url' | 'repo' | 'code' | 'stress'
  const [targetInput, setTargetInput] = useState('');
  const [codeSnippet, setCodeSnippet] = useState('');
  
  // Stress Testing state (configurable traffic volume without upper limit)
  const [stressEngineMode, setStressEngineMode] = useState('direct'); // 'direct' | 'chaos-k8s'
  const [stressUrl, setStressUrl] = useState('');
  const [stressVolume, setStressVolume] = useState('500'); // Unbounded, default 500
  const [stressConcurrency, setStressConcurrency] = useState('20');
  const [stressInterval, setStressInterval] = useState('50'); // Delay ms (simulasi kunjungan berkala)
  const [stressMethod, setStressMethod] = useState('GET');
  const [stressTimeout, setStressTimeout] = useState('10000');
  const [stressUseProxy, setStressUseProxy] = useState(false);
  const [stressRequestBody, setStressRequestBody] = useState('');
  const [stressLiveTick, setStressLiveTick] = useState(null);
  const [stressAbortController, setStressAbortController] = useState(null);

  // Advanced settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [scanMode, setScanMode] = useState('standard');
  const [instruction, setInstruction] = useState('');
  const [customGroqKey, setCustomGroqKey] = useState('');
  const [customOpenRouterKey, setCustomOpenRouterKey] = useState('');
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

  // Handle starting a scan (Security Pentest or Server Stress Test)
  const handleStartScan = async (e) => {
    if (e) e.preventDefault();
    if (activeTab === 'stress') {
      return handleStartStressTest(e);
    }
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
          openrouterApiKey: customOpenRouterKey.trim(),
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

  // Handle server stress testing with streaming telemetry
  const handleStartStressTest = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    let targetVal = (stressUrl || targetInput).trim();
    if (!targetVal) {
      setErrorMsg('Silakan masukkan domain atau URL target website untuk stress test.');
      return;
    }

    // Auto-normalize bare domain (e.g. sma3jogja.sch.id -> https://sma3jogja.sch.id)
    if (!/^https?:\/\//i.test(targetVal)) {
      targetVal = (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(targetVal) ? 'http://' : 'https://') + targetVal;
    }

    const volumeNum = Math.max(parseInt(stressVolume, 10) || 100, 1);
    const concurrencyNum = Math.max(parseInt(stressConcurrency, 10) || 10, 1);

    const controller = new AbortController();
    setStressAbortController(controller);
    setIsScanning(true);
    setScanProgress(0);
    setStatusMessage(`Memulai Pengujian Beban: ${volumeNum.toLocaleString()} permintaan @ ${concurrencyNum} CCU...`);
    setScanLogs([{ time: new Date().toLocaleTimeString(), text: `Menghubungkan ke ${targetVal} (${volumeNum.toLocaleString()} reqs @ ${concurrencyNum} pekerja paralel)...` }]);
    setStressLiveTick(null);
    setScanResult(null);

    try {
      const response = await fetch('/api/strix/stress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl: targetVal,
          method: stressMethod,
          totalRequests: volumeNum,
          concurrency: concurrencyNum,
          intervalMs: parseInt(stressInterval, 10) || 0,
          timeoutMs: parseInt(stressTimeout, 10) || 10000,
          useRotatingProxy: stressUseProxy,
          requestBody: stressRequestBody,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Stress test gagal dengan status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop();

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
              if (parsedData.percent !== undefined) setScanProgress(parsedData.percent);
              setStressLiveTick(parsedData);
              if (parsedData.message) {
                setStatusMessage(parsedData.message);
              } else if (parsedData.completed !== undefined) {
                setStatusMessage(`Testing: ${parsedData.completed.toLocaleString()}/${parsedData.total.toLocaleString()} (${parsedData.percent}%) • Live ${parsedData.liveRps} req/s • Latensi ${parsedData.avgLatency}ms`);
              }
            } else if (eventType === 'complete') {
              setScanProgress(100);
              setStatusMessage('Stress test selesai dievaluasi!');
              setScanResult({
                targetType: 'stress',
                target: targetVal,
                targetLabel: `${targetVal} (${parsedData.completedTotal?.toLocaleString()} reqs @ ${concurrencyNum} CCU)`,
                stressResult: parsedData,
                executiveSummary: parsedData.analysis?.statusSummary,
                summary: {
                  riskScore: parsedData.analysis?.grade === 'F' ? 100 : parsedData.analysis?.grade === 'D' ? 85 : parsedData.analysis?.grade === 'C' ? 65 : parsedData.analysis?.grade === 'B' ? 35 : 10,
                  riskRating: parsedData.analysis?.grade === 'F' ? 'CRITICAL' : parsedData.analysis?.grade === 'D' ? 'HIGH' : parsedData.analysis?.grade === 'C' ? 'MEDIUM' : parsedData.analysis?.grade === 'B' ? 'LOW' : 'SECURE',
                }
              });
              setIsScanning(false);
            } else if (eventType === 'error') {
              throw new Error(parsedData.message || 'Terjadi kesalahan saat pengujian beban server.');
            }
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setStatusMessage('Pengujian dihentikan secara manual oleh pengguna.');
      } else {
        console.error('Stress test error:', err);
        setErrorMsg(err.message || 'Pengujian performa server gagal.');
      }
      setIsScanning(false);
    } finally {
      setStressAbortController(null);
    }
  };

  const handleStopStressTest = () => {
    if (stressAbortController) {
      stressAbortController.abort();
      setStressAbortController(null);
      setStatusMessage('Menghentikan pengujian dan mengumpulkan telemetri...');
      showToast('Pengujian dihentikan. Mengumpulkan hasil...', 'info');
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
      if (data.targetType === 'stress') {
        setStressUrl(data.target || '');
      } else {
        setTargetInput(data.target || '');
      }
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
    const content = scanResult.stressResult ? scanResult.stressResult : (scanResult.vulnerabilities || []);
    const fileName = scanResult.stressResult 
      ? `stress_report_${scanResult.slug || 'server'}.json`
      : `vulnerabilities_${scanResult.slug || 'strix'}.json`;
    const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
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
    if (scanResult.stressResult) {
      const s = scanResult.stressResult;
      let md = `# Laporan Pengujian Beban & Kapasitas Server (Stress Test) — Strix\n\n`;
      md += `**Target:** ${s.target}\n`;
      md += `**Stability Grade:** ${s.analysis?.grade || 'N/A'}\n`;
      md += `**Evaluasi:** ${s.analysis?.stabilityStatus || 'Audit Selesai'}\n`;
      md += `**Tanggal:** ${new Date().toISOString()}\n\n`;
      md += `## Ringkasan Eksekutif\n\n${s.analysis?.statusSummary}\n\n`;
      md += `## Metrik Kapasitas & Beban\n\n`;
      md += `- **Total Request:** ${(s.completedTotal || 0).toLocaleString()}\n`;
      md += `- **Concurrency (CCU):** ${(Number(s.concurrency) || 0).toLocaleString()} virtual users\n`;
      md += `- **Durasi Pengujian:** ${s.durationSeconds} detik\n`;
      md += `- **Throughput Rata-rata:** ${s.averageRps} req/s\n`;
      md += `- **Batas Aman Maksimum (Safe RPS):** ${(Number(s.analysis?.safeCapacity?.safeRps || s.averageRps) || 0).toLocaleString()} req/s\n`;
      md += `- **Batas Pengguna Bersamaan Aman (Safe CCU):** ${(Number(s.analysis?.safeCapacity?.safeCcu || s.concurrency) || 0).toLocaleString()} CCU\n\n`;
      md += `## Latensi Respon (Percentiles)\n\n`;
      md += `- **Min Latency:** ${s.latency?.min} ms\n`;
      md += `- **Average Latency:** ${s.latency?.avg} ms\n`;
      md += `- **Median (p50):** ${s.latency?.p50} ms\n`;
      md += `- **90th Percentile (p90):** ${s.latency?.p90} ms\n`;
      md += `- **95th Percentile (p95):** ${s.latency?.p95} ms\n`;
      md += `- **99th Percentile (p99):** ${s.latency?.p99} ms\n`;
      md += `- **Max Latency:** ${s.latency?.max} ms\n\n`;
      if (s.analysis?.bottlenecks?.length) {
        md += `## Titik Lemah / Bottlenecks Terdeteksi\n\n`;
        s.analysis.bottlenecks.forEach(b => {
          md += `### ${b.category}\n- **Detail:** ${b.detail}\n- **Dampak:** ${b.impact}\n\n`;
        });
      }
      if (s.analysis?.recommendations?.length) {
        md += `## Rekomendasi Solusi & Optimasi Developer\n\n`;
        s.analysis.recommendations.forEach(r => {
          md += `- **[${r.priority}] ${r.action}:** ${r.detail}\n`;
        });
      }
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stress_report_${scanResult.slug || 'server'}.md`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

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

    if (scanResult.vulnerabilityStressImpact) {
      const imp = scanResult.vulnerabilityStressImpact;
      md += `## Evaluasi Dampak Beban & Risiko DoS Celah (Stress Engine Cooperation)\n\n`;
      md += `**Tingkat Risiko DoS:** ${imp.blastRadius?.overallDosRisk}\n`;
      md += `**Maksimum Inflasi Latensi:** ${imp.blastRadius?.maxLatencyInflation}\n`;
      md += `**Kesimpulan Evaluasi:** ${imp.blastRadius?.conclusions}\n\n`;
      (imp.vulnerableEndpoints || []).forEach((ep) => {
        md += `### Celah: [${ep.method}] ${ep.path} (${ep.title})\n`;
        md += `- **Latensi Baseline Web:** ${ep.comparison?.baselineAvgLatency}ms (Error: ${ep.comparison?.baselineErrorRate}%)\n`;
        md += `- **Latensi Endpoint Celah:** ${ep.comparison?.vulnerableAvgLatency}ms (Error: ${ep.comparison?.vulnerableErrorRate}%)\n`;
        md += `- **Amplifikasi Beban:** ${ep.comparison?.latencyMultiplier}x lipat lebih lambat\n`;
        md += `- **Tingkat Risiko DoS:** ${ep.comparison?.dosVulnerabilityRisk}\n`;
        md += `- **Analisis:** ${ep.comparison?.impactDescription}\n\n`;
      });
      if (imp.blastRadius?.developerActionItems?.length) {
        md += `### Checklist Developer: Mitigasi Dampak Beban\n\n`;
        imp.blastRadius.developerActionItems.forEach((act) => {
          md += `- ${act}\n`;
        });
        md += `\n`;
      }
    }

    if (scanResult.accountTakeoverAssessment) {
      const ato = scanResult.accountTakeoverAssessment;
      md += `## Audit Keamanan: Ketahanan Autentikasi & Account Takeover (ATO Assessment)\n\n`;
      md += `**Tingkat Risiko ATO:** ${ato.overallAtoRisk}\n`;
      md += `**Endpoint Target:** ${ato.targetUrl}\n`;
      md += `**Ringkasan:** ${ato.executiveSummary}\n\n`;

      md += `### Perbandingan Vektor Ancaman (Brute-Force vs. Credential Stuffing)\n\n`;
      md += `| Parameter | Brute-Force | Credential Stuffing | Konteks Teknis |\n`;
      md += `|---|---|---|---|\n`;
      (ato.threatComparisonMatrix || []).forEach((c) => {
        md += `| ${c.parameter} | ${c.bruteForce} | ${c.credentialStuffing} | ${c.technicalContext} |\n`;
      });
      md += `\n`;

      md += `### Evaluasi Mekanisme Proteksi Autentikasi\n\n`;
      md += `- **Pembatasan Laju Akses (Single-IP):** ${ato.rateLimitingEvaluation?.singleIpThreshold}\n`;
      md += `- **Ketahanan Evasion Terdistribusi (Multi-IP/Proxy):** ${ato.rateLimitingEvaluation?.wafDistributedDetection}\n`;
      md += `- **Pertahanan Bot & CAPTCHA:** ${ato.botProtectionEvaluation?.captchaProvider} (${ato.botProtectionEvaluation?.challengeResponseMechanism})\n`;
      md += `- **Username Enumeration (CWE-204):** ${ato.responseAnalysis?.enumerationVector} (Timing Delta: ${ato.responseAnalysis?.timingDiscrepancyMs}ms)\n`;
      md += `- **Analisis Respon:** ${ato.responseAnalysis?.analysisConclusion}\n\n`;

      if (ato.developerRemediationPlan?.length) {
        md += `### Checklist Tim Pengembang: Mitigasi ATO & Autentikasi\n\n`;
        ato.developerRemediationPlan.forEach((r) => {
          md += `- **[${r.priority}] ${r.action}:** ${r.details}\n`;
        });
        md += `\n`;
      }
    }

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
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'stress' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('stress')}
            >
              <Activity size={18} />
              Stress / Load Test (Unbounded)
            </button>
          </div>

          <form onSubmit={handleStartScan}>
            {activeTab === 'stress' ? (
              <div>
                {/* Engine Mode Switcher: Direct HTTP vs Distributed K8s & Chaos Mesh */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(15, 23, 42, 0.7)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 18px', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)' }}>
                    <Activity size={18} style={{ color: '#f59e0b' }} />
                    Mode Engine Pengujian Beban:
                  </div>
                  <div style={{ display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.35)', padding: '4px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <button
                      type="button"
                      style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer',
                        background: stressEngineMode === 'direct' ? 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' : 'transparent',
                        color: stressEngineMode === 'direct' ? '#ffffff' : 'var(--text-muted)',
                        boxShadow: stressEngineMode === 'direct' ? '0 2px 10px rgba(239, 68, 68, 0.3)' : 'none',
                        transition: 'all 0.2s'
                      }}
                      onClick={() => setStressEngineMode('direct')}
                    >
                      🚀 Real-time HTTP Stress (In-App)
                    </button>
                    <button
                      type="button"
                      style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer',
                        background: stressEngineMode === 'chaos-k8s' ? 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' : 'transparent',
                        color: stressEngineMode === 'chaos-k8s' ? '#ffffff' : 'var(--text-muted)',
                        boxShadow: stressEngineMode === 'chaos-k8s' ? '0 2px 10px rgba(239, 68, 68, 0.3)' : 'none',
                        transition: 'all 0.2s'
                      }}
                      onClick={() => setStressEngineMode('chaos-k8s')}
                    >
                      ⚡ Distributed K8s &amp; Chaos Mesh Suite
                    </button>
                  </div>
                </div>

                {stressEngineMode === 'chaos-k8s' ? (
                  <ChaosMeshSuiteView initialUrl={targetInput || stressUrl || ''} scanResult={scanResult} />
                ) : (
                  <>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>
                        Domain / URL Base Website Target untuk Stress Test
                      </label>
                      <div className={styles.inputWrapper}>
                        <Activity size={20} className={styles.inputIcon} />
                        <input
                          type="text"
                          className={styles.textInput}
                          placeholder="Masukkan domain/URL website saja, misal: sma3jogja.sch.id atau https://example.com"
                          value={stressUrl}
                          onChange={(e) => setStressUrl(e.target.value)}
                          disabled={isScanning}
                        />
                      </div>
                    </div>

                    {/* Config Grid: Volume, Concurrency, Interval, Method, Timeout */}
                    <div className={styles.stressConfigGrid}>
                      <div>
                        <label className={styles.formLabel}>
                          Volume Trafik Total (Jumlah Permintaan - Tanpa Batas Maksimum)
                        </label>
                        <input
                          type="number"
                          min="1"
                          className={styles.textInput}
                          style={{ paddingLeft: '14px', fontWeight: 600 }}
                          placeholder="e.g. 500, 5000, 50000, 100000..."
                          value={stressVolume}
                          onChange={(e) => setStressVolume(e.target.value)}
                          disabled={isScanning}
                        />
                        <div className={styles.presetRow}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Preset Cepat:</span>
                          {['200', '500', '1000', '5000', '10000', '25000', '50000', '100000'].map((vol) => (
                            <button
                              key={vol}
                              type="button"
                              className={`${styles.presetPill} ${stressVolume === vol ? styles.presetPillActive : ''}`}
                              onClick={() => setStressVolume(vol)}
                              disabled={isScanning}
                            >
                              {Number(vol) >= 1000 ? `${Number(vol) / 1000}k` : vol}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className={styles.formLabel}>
                          Concurrency (Virtual Users / CCU Bersamaan - Tanpa Batas Maksimum)
                        </label>
                        <input
                          type="number"
                          min="1"
                          className={styles.textInput}
                          style={{ paddingLeft: '14px', fontWeight: 600 }}
                          placeholder="e.g. 10, 50, 200, 1000, 5000..."
                          value={stressConcurrency}
                          onChange={(e) => setStressConcurrency(e.target.value)}
                          disabled={isScanning}
                        />
                        <div className={styles.presetRow}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Preset Cepat:</span>
                          {['10', '25', '50', '100', '250', '500', '1000', '2500', '5000', '10000'].map((ccu) => (
                            <button
                              key={ccu}
                              type="button"
                              className={`${styles.presetPill} ${stressConcurrency === ccu ? styles.presetPillActive : ''}`}
                              onClick={() => setStressConcurrency(ccu)}
                              disabled={isScanning}
                            >
                              {Number(ccu) >= 1000 ? `${Number(ccu) / 1000}k` : ccu} CCU
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className={styles.formLabel}>
                          Jeda Antar Request (Simulasi Kunjungan Pengguna Berkala)
                        </label>
                        <select
                          className={styles.selectInput}
                          value={stressInterval}
                          onChange={(e) => setStressInterval(e.target.value)}
                          disabled={isScanning}
                        >
                          <option value="0">0 ms (Full Flood / Maksimum Throughput Langsung)</option>
                          <option value="25">25 ms (Kunjungan Cepat / Peak Traffic)</option>
                          <option value="50">50 ms (Simulasi Pengguna Aktif Normal)</option>
                          <option value="100">100 ms (Kunjungan Berkala Sedang)</option>
                          <option value="250">250 ms (Simulasi Santai / Browsing Organik)</option>
                          <option value="500">500 ms (Simulasi Kunjungan Ringan Berkala)</option>
                          <option value="1000">1000 ms (1 Detik Sekali per Pengguna)</option>
                        </select>
                      </div>

                      <div>
                        <label className={styles.formLabel}>HTTP Method</label>
                        <select
                          className={styles.selectInput}
                          value={stressMethod}
                          onChange={(e) => setStressMethod(e.target.value)}
                          disabled={isScanning}
                        >
                          <option value="GET">GET (Ambil Halaman / API Data)</option>
                          <option value="POST">POST (Simulasi Kirim Form / Submit API)</option>
                          <option value="HEAD">HEAD (Hanya Cek Header Server)</option>
                          <option value="PUT">PUT (Update Resource)</option>
                        </select>
                      </div>

                      <div>
                        <label className={styles.formLabel}>Timeout per Request (ms)</label>
                        <select
                          className={styles.selectInput}
                          value={stressTimeout}
                          onChange={(e) => setStressTimeout(e.target.value)}
                          disabled={isScanning}
                        >
                          <option value="5000">5.000 ms (5 Detik - Respon Cepat)</option>
                          <option value="10000">10.000 ms (10 Detik - Standar)</option>
                          <option value="15000">15.000 ms (15 Detik)</option>
                          <option value="30000">30.000 ms (30 Detik - Long Wait)</option>
                        </select>
                      </div>

                      <div className={styles.proxyToggleBox}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-main)' }}>
                          <input
                            type="checkbox"
                            checked={stressUseProxy}
                            onChange={(e) => setStressUseProxy(e.target.checked)}
                            disabled={isScanning}
                          />
                          <span>Gunakan IP Rotating Proxy</span>
                        </label>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Rotasi IP dari pool proxy publik agar simulasi berasal dari berbagai IP berbeda (mencegah blokir rate-limiter per-IP).
                        </span>
                      </div>
                    </div>

                    {(stressMethod === 'POST' || stressMethod === 'PUT') && (
                      <div className={styles.formGroup} style={{ marginTop: '14px' }}>
                        <label className={styles.formLabel}>Request Body (JSON / Raw Payload)</label>
                        <textarea
                          className={styles.codeTextarea}
                          style={{ minHeight: '90px' }}
                          placeholder='{"username": "stress_test_user", "action": "ping"}'
                          value={stressRequestBody}
                          onChange={(e) => setStressRequestBody(e.target.value)}
                          disabled={isScanning}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : activeTab !== 'code' ? (
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

            {/* Advanced Settings Toggle (Only for standard pentest) */}
            {activeTab !== 'stress' && (
              <>
                <button
                  type="button"
                  className={styles.settingsToggle}
                  onClick={() => setShowAdvanced(!showAdvanced)}
                >
                  <Sliders size={16} />
                  {showAdvanced ? 'Hide Advanced Options' : 'Show Advanced Options (Scope, Mode, API Keys)'}
                  {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

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

                    <div>
                      <label className={styles.formLabel}>OpenRouter API Key (Fallback AI - Optional)</label>
                      <input
                        type="password"
                        className={styles.textInput}
                        style={{ paddingLeft: '14px' }}
                        placeholder="sk-or-v1-... (Defaults to system env free tier)"
                        value={customOpenRouterKey}
                        onChange={(e) => setCustomOpenRouterKey(e.target.value)}
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
              </>
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

              {activeTab === 'stress' ? (
                stressEngineMode === 'chaos-k8s' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fbbf24', fontSize: '0.85rem', fontWeight: 600 }}>
                    <CheckCircle2 size={16} />
                    Suite Distributed K8s &amp; Chaos Mesh aktif. Gunakan tab manifest &amp; panduan CLI di atas.
                  </div>
                ) : isScanning ? (
                  <button
                    type="button"
                    className={styles.stopStressBtn}
                    onClick={handleStopStressTest}
                  >
                    <StopCircle size={18} />
                    Hentikan Pengujian Sekarang
                  </button>
                ) : (
                  <button
                    type="submit"
                    className={styles.launchBtn}
                    disabled={isScanning}
                    style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' }}
                  >
                    <Zap size={18} />
                    Mulai Pengujian Beban / Stress Test
                  </button>
                )
              ) : (
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
              )}
            </div>
          </form>
        </div>

        {/* Real-time Progress & Live Telemetry Terminal */}
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

            {/* Live Telemetry Card for Stress Testing */}
            {activeTab === 'stress' && stressLiveTick && (
              <div className={styles.stressLiveCard}>
                <div className={styles.stressLiveHeader}>
                  <div className={styles.stressLiveTitle}>
                    <span className={styles.livePulseDot} />
                    Live Server Telemetry & Throughput Monitor
                  </div>
                  <button
                    type="button"
                    className={styles.stopStressBtn}
                    style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                    onClick={handleStopStressTest}
                  >
                    <StopCircle size={15} />
                    Stop Test
                  </button>
                </div>

                <div className={styles.stressLiveGrid}>
                  <div className={styles.liveMetricCard}>
                    <div className={styles.liveMetricLabel}>Live Throughput</div>
                    <div className={styles.liveMetricValue} style={{ color: '#38bdf8' }}>
                      {stressLiveTick.liveRps || 0} <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>req/s</span>
                    </div>
                  </div>
                  <div className={styles.liveMetricCard}>
                    <div className={styles.liveMetricLabel}>Avg Latency</div>
                    <div className={styles.liveMetricValue}>
                      {stressLiveTick.avgLatency || 0} <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>ms</span>
                    </div>
                  </div>
                  <div className={styles.liveMetricCard}>
                    <div className={styles.liveMetricLabel}>Completed Reqs</div>
                    <div className={styles.liveMetricValue}>
                      {(stressLiveTick.completed || 0).toLocaleString()} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>/ {(stressLiveTick.total || 0).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className={styles.liveMetricCard}>
                    <div className={styles.liveMetricLabel}>Success (2xx)</div>
                    <div className={styles.liveMetricValue} style={{ color: '#34d399' }}>
                      {(stressLiveTick.successCount || 0).toLocaleString()}
                    </div>
                  </div>
                  <div className={styles.liveMetricCard}>
                    <div className={styles.liveMetricLabel}>Errors / Failures</div>
                    <div className={styles.liveMetricValue} style={{ color: (stressLiveTick.errorCount || 0) > 0 ? '#f87171' : 'var(--text-muted)' }}>
                      {(stressLiveTick.errorCount || 0).toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Status code pills */}
                {stressLiveTick.statusCounts && (
                  <div className={styles.statusPillsWrap}>
                    {Object.entries(stressLiveTick.statusCounts).map(([status, count]) => {
                      const is2xx = status.startsWith('2');
                      const is3xx = status.startsWith('3');
                      const is4xx = status.startsWith('4');
                      const is5xx = status.startsWith('5');
                      const pillClass = is2xx ? styles.statusPill2xx : is3xx ? styles.statusPill3xx : is4xx ? styles.statusPill4xx : is5xx ? styles.statusPill5xx : styles.statusPillErr;
                      return (
                        <span key={status} className={`${styles.statusPill} ${pillClass}`}>
                          HTTP {status}: {count}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Breaking Point Warning Banner */}
                {stressLiveTick.breakingPointDetected && (
                  <div className={styles.breakingPointBanner}>
                    <AlertTriangle size={20} />
                    <div>
                      <strong>Perhatian: Titik Degradasi Server (Breaking Point) Terdeteksi!</strong>
                      <div>Tingkat kegagalan atau timeout meningkat signifikan saat volume beban dinaikkan.</div>
                    </div>
                  </div>
                )}
              </div>
            )}

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
            {scanResult.stressResult ? (
              <StressReportView
                stressResult={scanResult.stressResult}
                copiedId={copiedId}
                handleCopy={handleCopy}
                downloadJSON={downloadJSON}
                downloadMarkdownReport={downloadMarkdownReport}
              />
            ) : (
              <>
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

            {/* Strix Pentest + Stress Engine Cooperative Impact Card */}
            {scanResult.vulnerabilityStressImpact && (
              <VulnerabilityStressImpactCard impact={scanResult.vulnerabilityStressImpact} />
            )}

            {/* Account Takeover (ATO) Resilience Assessment Card */}
            {scanResult.accountTakeoverAssessment && (
              <AccountTakeoverAssessmentCard assessment={scanResult.accountTakeoverAssessment} />
            )}

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
              </>
            )}
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
                          {item.targetType === 'stress' ? `⚡ ${item.target}` : item.target}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {new Date(item.createdAt).toLocaleString()} • {item.targetType === 'stress' ? 'LOAD TEST' : item.scanMode?.toUpperCase()} •{' '}
                          {item.targetType === 'stress'
                            ? `${(item.stressResult?.completedTotal || 0).toLocaleString()} reqs @ ${item.stressResult?.concurrency || 0} CCU (${item.stressResult?.averageRps || 0} req/s)`
                            : `${item.summary?.totalVulnerabilities || 0} findings`}
                        </div>
                      </div>

                      <div className={styles.historyItemRight}>
                        <span
                          className={
                            item.targetType === 'stress'
                              ? styles.badgeStress
                              : item.summary?.riskRating === 'CRITICAL'
                              ? styles.badgeCrit
                              : item.summary?.riskRating === 'HIGH'
                              ? styles.badgeHigh
                              : item.summary?.riskRating === 'MEDIUM'
                              ? styles.badgeMed
                              : styles.badgeLow
                          }
                        >
                          {item.targetType === 'stress'
                            ? `GRADE ${item.stressResult?.analysis?.grade || 'TEST'}`
                            : item.summary?.riskRating || 'AUDITED'}
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

