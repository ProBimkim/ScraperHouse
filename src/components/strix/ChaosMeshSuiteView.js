'use client';

import React, { useState, useMemo } from 'react';
import styles from './ChaosMeshSuiteView.module.css';
import { generateChaosMeshSuite } from '@/lib/stressEngine';
import {
  Layers,
  Cpu,
  Server,
  Network,
  ShieldAlert,
  AlertTriangle,
  Play,
  Terminal,
  Copy,
  Check,
  Download,
  FileCode,
  CheckCircle2,
  RefreshCw,
  HardDrive,
  Database,
  Activity,
  Sliders,
  Flame,
  ArrowRight
} from 'lucide-react';

export default function ChaosMeshSuiteView() {
  // Config state
  const [namespace, setNamespace] = useState('dev');
  const [backendReplicas, setBackendReplicas] = useState('4');
  const [backendCpuLimit, setBackendCpuLimit] = useState('500m');
  const [backendMemoryLimit, setBackendMemoryLimit] = useState('256Mi');
  const [k6Parallelism, setK6Parallelism] = useState('4');
  const [targetUrl, setTargetUrl] = useState('http://backend-service.dev.svc.cluster.local/');
  const [peakTargetRps, setPeakTargetRps] = useState('1000');
  const [networkLatency, setNetworkLatency] = useState('150ms');
  const [networkLoss, setNetworkLoss] = useState('5');
  const [cpuStressLoad, setCpuStressLoad] = useState('90');
  const [podKillCron, setPodKillCron] = useState('*/30 * * * * *');
  const [abort5xxRatePercent, setAbort5xxRatePercent] = useState('30');

  // Active file tab
  const [activeFile, setActiveFile] = useState('01-target-app.yaml');
  const [copiedKey, setCopiedKey] = useState(null);

  // Generate suite reactively
  const suite = useMemo(() => {
    return generateChaosMeshSuite({
      namespace,
      backendReplicas,
      backendCpuLimit,
      backendMemoryLimit,
      k6Parallelism,
      targetUrl,
      peakTargetRps,
      networkLatency,
      networkLoss,
      cpuStressLoad,
      podKillCron,
      abort5xxRatePercent,
    });
  }, [
    namespace,
    backendReplicas,
    backendCpuLimit,
    backendMemoryLimit,
    k6Parallelism,
    targetUrl,
    peakTargetRps,
    networkLatency,
    networkLoss,
    cpuStressLoad,
    podKillCron,
    abort5xxRatePercent,
  ]);

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleDownload = (filename, content) => {
    const mime = filename.endsWith('.js') ? 'text/javascript' : 'text/yaml';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAllBundle = () => {
    const blob = new Blob([suite.files['full-bundle-k8s.yaml']], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `k8s_chaos_suite_${namespace}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fileKeys = [
    { key: '01-target-app.yaml', label: '01-target-app.yaml', desc: 'Target App (Backend 4x & Redis)' },
    { key: '02-k6-script.js', label: '02-k6-script.js', desc: 'Distributed k6 Test Script' },
    { key: '03-k6-operator-cr.yaml', label: '03-k6-operator-cr.yaml', desc: 'k6 Operator CR (4 Runners)' },
    { key: '04-chaos-workflow-master.yaml', label: '04-chaos-workflow-master.yaml', desc: 'Chaos Mesh Multi-stage Workflow' },
    { key: '05-prometheus-abort-rule.yaml', label: '05-prometheus-abort-rule.yaml', desc: 'Prometheus Emergency Abort Rule' },
    { key: 'full-bundle-k8s.yaml', label: 'full-bundle-k8s.yaml', desc: 'All-in-One Combined Bundle' },
  ];

  return (
    <div className={styles.chaosSuiteContainer}>
      {/* Parameter Customizer Card */}
      <div className={styles.chaosConfigCard}>
        <div className={styles.chaosConfigTitle}>
          <Sliders size={20} style={{ color: '#f59e0b' }} />
          Parameter Generator: Distributed k6 & Chaos Mesh Orchestration
        </div>
        <p className={styles.chaosConfigSubtitle}>
          Konfigurasikan spesifikasi pod target, runner k6 operator terdistribusi, parameter injeksi degradasi jaringan, stress CPU/RAM, pod killer, dan safety threshold Prometheus. Seluruh manifest di bawah akan diperbarui secara otomatis.
        </p>

        <div className={styles.chaosGrid}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Kubernetes Namespace</label>
            <input
              type="text"
              className={styles.textInput}
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              placeholder="dev"
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>Backend Replicas</label>
            <select
              className={styles.selectInput}
              value={backendReplicas}
              onChange={(e) => setBackendReplicas(e.target.value)}
            >
              <option value="2">2 Pods</option>
              <option value="4">4 Pods (Rekomendasi Uji Load Balancing)</option>
              <option value="8">8 Pods</option>
              <option value="16">16 Pods</option>
            </select>
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>CPU Limit per Pod</label>
            <input
              type="text"
              className={styles.textInput}
              value={backendCpuLimit}
              onChange={(e) => setBackendCpuLimit(e.target.value)}
              placeholder="500m"
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>Memory Limit per Pod</label>
            <input
              type="text"
              className={styles.textInput}
              value={backendMemoryLimit}
              onChange={(e) => setBackendMemoryLimit(e.target.value)}
              placeholder="256Mi"
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>k6 Parallel Runners (Pod)</label>
            <select
              className={styles.selectInput}
              value={k6Parallelism}
              onChange={(e) => setK6Parallelism(e.target.value)}
            >
              <option value="2">2 Runner Pods (500 RPS/runner)</option>
              <option value="4">4 Runner Pods (250 RPS/runner)</option>
              <option value="8">8 Runner Pods (125 RPS/runner)</option>
            </select>
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>Peak Stress Load (RPS)</label>
            <input
              type="number"
              className={styles.textInput}
              value={peakTargetRps}
              onChange={(e) => setPeakTargetRps(e.target.value)}
              placeholder="1000"
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>Network Chaos Latency</label>
            <input
              type="text"
              className={styles.textInput}
              value={networkLatency}
              onChange={(e) => setNetworkLatency(e.target.value)}
              placeholder="150ms"
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>Network Packet Loss (%)</label>
            <input
              type="number"
              className={styles.textInput}
              value={networkLoss}
              onChange={(e) => setNetworkLoss(e.target.value)}
              placeholder="5"
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>CPU Stress Load (%)</label>
            <input
              type="number"
              className={styles.textInput}
              value={cpuStressLoad}
              onChange={(e) => setCpuStressLoad(e.target.value)}
              placeholder="90"
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>Pod Kill Scheduler (Cron)</label>
            <input
              type="text"
              className={styles.textInput}
              value={podKillCron}
              onChange={(e) => setPodKillCron(e.target.value)}
              placeholder="*/30 * * * * *"
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>Emergency Abort 5xx Threshold</label>
            <select
              className={styles.selectInput}
              value={abort5xxRatePercent}
              onChange={(e) => setAbort5xxRatePercent(e.target.value)}
            >
              <option value="20">&gt; 20% Errors (Strict)</option>
              <option value="30">&gt; 30% Errors (Standar Safety)</option>
              <option value="50">&gt; 50% Errors (High Tolerance)</option>
            </select>
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>Target Cluster Service URL</label>
            <input
              type="text"
              className={styles.textInput}
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="http://backend-service.dev.svc.cluster.local/"
            />
          </div>
        </div>
      </div>

      {/* Architecture Visualizer Card */}
      <div className={styles.archCard}>
        <div className={styles.archHeader}>
          <div className={styles.archTitle}>
            <Network size={18} />
            Topologi Arsitektur: Chaos Mesh & Distributed Load Testing
          </div>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
            Cloud-Native Kubernetes & Physical Node-Level Injections
          </span>
        </div>

        <div className={styles.archVisualWrap}>
          {/* Top Monitoring & Control Layer */}
          <div className={styles.archTopRow}>
            <div className={styles.archBoxPrometheus}>
              <Activity size={16} style={{ display: 'inline', marginRight: '6px' }} />
              Prometheus & Alertmanager
              <div style={{ fontSize: '0.72rem', fontWeight: 400, opacity: 0.85, marginTop: '4px' }}>
                Rule: 5xx &gt; {abort5xxRatePercent}% ➔ Auto-Abort
              </div>
            </div>

            <div className={styles.archBoxDashboard}>
              <Layers size={16} style={{ display: 'inline', marginRight: '6px' }} />
              Dashboard (Chaos Manager)
              <div style={{ fontSize: '0.72rem', fontWeight: 400, opacity: 0.85, marginTop: '4px' }}>
                Workflow Orchestrator (Serial &amp; Parallel)
              </div>
            </div>
          </div>

          {/* Dual Domains: K8s Environment vs Physical Node Layer */}
          <div className={styles.archDomainsRow}>
            {/* K8s Domain */}
            <div className={styles.archDomainK8s}>
              <div className={styles.domainTitle} style={{ color: '#60a5fa' }}>
                <Server size={16} />
                Chaos Mesh Service (Kubernetes Environment: namespace &quot;{namespace}&quot;)
              </div>

              {/* Service Control Layer */}
              <div className={styles.serviceLayer}>
                <div className={styles.serviceBadge}>cAdvisor</div>
                <div className={styles.serviceBadge}>kube-state-metrics</div>
                <div className={styles.serviceBadge}>controller-manager</div>
                <div className={styles.serviceBadge}>K8s API Server</div>
              </div>

              {/* K8s Nodes */}
              <div className={styles.nodesContainer}>
                <div className={styles.nodeBox}>
                  <div className={styles.nodeHeader}>K8s Worker Node 01</div>
                  <div className={styles.podPillDaemon}>DaemonSet: chaos-daemon</div>
                  <div className={styles.podPillApp}>Pod: backend-api-pod-1 ({backendCpuLimit})</div>
                  <div className={styles.podPillApp}>Pod: k6-runner-1 (Distributed)</div>
                </div>

                <div className={styles.nodeBox}>
                  <div className={styles.nodeHeader}>K8s Worker Node 02</div>
                  <div className={styles.podPillDaemon}>DaemonSet: chaos-daemon</div>
                  <div className={styles.podPillApp}>Pod: backend-api-pod-2 ({backendCpuLimit})</div>
                  <div className={styles.podPillApp}>Pod: database (Redis 6379)</div>
                </div>
              </div>
            </div>

            {/* Physical / Baremetal Domain */}
            <div className={styles.archDomainPhysical}>
              <div className={styles.domainTitle} style={{ color: '#fbbf24' }}>
                <Cpu size={16} />
                chaocsd service (Physical / Baremetal)
              </div>

              <div className={styles.serviceLayer} style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className={styles.serviceBadge} style={{ color: '#fde68a', borderColor: 'rgba(245, 158, 11, 0.4)' }}>
                  node-exporter
                </div>
                <div className={styles.serviceBadge} style={{ color: '#fde68a', borderColor: 'rgba(245, 158, 11, 0.4)' }}>
                  chaosd
                </div>
              </div>

              <div className={styles.nodeBox}>
                <div className={styles.nodeHeader}>Host Process Space</div>
                <div className={styles.podPillApp} style={{ background: 'rgba(245, 158, 11, 0.15)', borderColor: 'rgba(245, 158, 11, 0.4)', color: '#fbbf24' }}>
                  APP Process (Backend Daemon)
                </div>
                <div className={styles.podPillDaemon} style={{ background: 'rgba(245, 158, 11, 0.15)', borderColor: 'rgba(245, 158, 11, 0.4)', color: '#fbbf24' }}>
                  Systemd / OS Kernel Limits
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Manifest & Script Code Viewer */}
      <div className={styles.manifestViewerCard}>
        <div className={styles.manifestTabBar}>
          <div className={styles.fileTabsList}>
            {fileKeys.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`${styles.fileTabBtn} ${activeFile === item.key ? styles.fileTabBtnActive : ''}`}
                onClick={() => setActiveFile(item.key)}
              >
                <FileCode size={14} />
                {item.label}
              </button>
            ))}
          </div>

          <div className={styles.fileActions}>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => handleCopy(suite.files[activeFile], `file-${activeFile}`)}
            >
              {copiedKey === `file-${activeFile}` ? <Check size={14} style={{ color: '#34d399' }} /> : <Copy size={14} />}
              {copiedKey === `file-${activeFile}` ? 'Tersalin!' : 'Salin File'}
            </button>

            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => handleDownload(activeFile, suite.files[activeFile])}
            >
              <Download size={14} />
              Unduh
            </button>

            <button
              type="button"
              className={styles.actionBtn}
              style={{ background: 'rgba(245, 158, 11, 0.2)', borderColor: 'rgba(245, 158, 11, 0.5)', color: '#fbbf24' }}
              onClick={handleDownloadAllBundle}
            >
              <Download size={14} />
              Unduh Semua Bundle
            </button>
          </div>
        </div>

        <pre className={styles.codeArea}>
          <code>{suite.files[activeFile]}</code>
        </pre>
      </div>

      {/* Step-by-Step CLI Execution Guide */}
      <div className={styles.cliStepsCard}>
        <div className={styles.cliHeader}>
          <div className={styles.cliTitle}>
            <Terminal size={20} style={{ color: '#38bdf8' }} />
            Panduan Eksekusi Operasional CLI (Step-by-Step)
          </div>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => {
              const allCmds = suite.cliSteps.map(s => `# Langkah ${s.step}: ${s.title}\n${s.command}`).join('\n\n');
              handleCopy(allCmds, 'all-cli-steps');
            }}
          >
            {copiedKey === 'all-cli-steps' ? <Check size={14} style={{ color: '#34d399' }} /> : <Copy size={14} />}
            {copiedKey === 'all-cli-steps' ? 'Semua Command Tersalin!' : 'Salin Semua Perintah CLI'}
          </button>
        </div>

        <div className={styles.stepList}>
          {suite.cliSteps.map((s) => (
            <div key={s.step} className={styles.stepItem}>
              <div className={styles.stepTop}>
                <div className={styles.stepHeading}>
                  <span className={styles.stepNumber}>{s.step}</span>
                  <span>{s.title}</span>
                </div>
                {s.filename && <span className={styles.stepFileTag}>{s.filename}</span>}
              </div>

              <div className={styles.stepDesc}>{s.description}</div>

              <div className={styles.stepCommandBlock}>
                <code className={styles.stepCommandText}>{s.command}</code>
                <button
                  type="button"
                  className={styles.copyStepBtn}
                  onClick={() => handleCopy(s.command, `step-${s.step}`)}
                  title="Salin perintah ini"
                >
                  {copiedKey === `step-${s.step}` ? <Check size={13} style={{ color: '#34d399' }} /> : <Copy size={13} />}
                  {copiedKey === `step-${s.step}` ? 'Tersalin' : 'Salin'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
