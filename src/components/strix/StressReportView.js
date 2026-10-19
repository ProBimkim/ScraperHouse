'use client';

import React from 'react';
import styles from '@/app/strix/page.module.css';
import {
  Activity,
  Zap,
  Gauge,
  Clock,
  TrendingUp,
  BarChart2,
  CheckCircle2,
  AlertTriangle,
  Download,
  FileCode,
  Copy,
  Check,
  Cpu,
  ListChecks
} from 'lucide-react';

export default function StressReportView({
  stressResult,
  copiedId,
  handleCopy,
  downloadJSON,
  downloadMarkdownReport
}) {
  if (!stressResult) return null;

  const analysis = stressResult.analysis || {};
  const safeCapacity = analysis.safeCapacity || {};
  const breakingPoint = analysis.breakingPoint;
  const latency = stressResult.latency || {};
  const statusCodes = stressResult.statusCodes || {};
  const bottlenecks = analysis.bottlenecks || [];
  const recommendations = analysis.recommendations || [];
  const networkErrors = stressResult.networkErrors || {};
  const errorsSummary = stressResult.errorsSummary || [];

  const grade = analysis.grade || 'N/A';
  const gradeClass =
    grade === 'A+' ? styles.gradeA :
    grade === 'A' ? styles.gradeA :
    grade === 'B' ? styles.gradeB :
    grade === 'C' ? styles.gradeC :
    grade === 'D' ? styles.gradeD : styles.gradeF;

  return (
    <div className={styles.stressReportContainer}>
      {/* Grade & Safe Capacity Hero */}
      <div className={styles.stressGradeHero}>
        <div className={styles.gradeCircleWrap}>
          <div className={`${styles.gradeBadgeLarge} ${gradeClass}`}>
            {grade}
          </div>

          <div className={styles.gradeTextGroup}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b', fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <Activity size={15} />
              Laporan Evaluasi Performa & Kapasitas Server
            </div>
            <h2>
              {analysis.stabilityStatus || 'Audit Performa Selesai'}
            </h2>
            <p>
              {analysis.statusSummary}
            </p>
            <div style={{ marginTop: '8px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Target: <strong style={{ color: 'var(--text-main)' }}>{stressResult.target}</strong> • Volume:{' '}
              <strong>{(stressResult.completedTotal || 0).toLocaleString()} reqs</strong> • Concurrency:{' '}
              <strong>{(Number(stressResult.concurrency) || 0).toLocaleString()} CCU</strong> • Durasi:{' '}
              <strong>{stressResult.durationSeconds} detik</strong> • Throughput Rata-rata:{' '}
              <strong style={{ color: '#38bdf8' }}>{stressResult.averageRps} req/s</strong>
            </div>
          </div>
        </div>

        {/* Safe Capacity Cards */}
        <div className={styles.capacityBadges}>
          <div className={styles.capacityCard}>
            <div className={styles.capacityCardVal}>
              {(Number(safeCapacity.safeRps || stressResult.averageRps) || 0).toLocaleString()}
              <span style={{ fontSize: '0.8rem', fontWeight: 500, marginLeft: '4px' }}>req/s</span>
            </div>
            <div className={styles.capacityCardLbl}>Batas Maksimum RPS Aman</div>
          </div>
          <div className={styles.capacityCard}>
            <div className={styles.capacityCardVal}>
              {(Number(safeCapacity.safeCcu || stressResult.concurrency) || 0).toLocaleString()}
              <span style={{ fontSize: '0.8rem', fontWeight: 500, marginLeft: '4px' }}>CCU</span>
            </div>
            <div className={styles.capacityCardLbl}>Batas Pengguna Bersamaan</div>
          </div>
        </div>

        {/* Breaking Point Alert if triggered */}
        {breakingPoint ? (
          <div className={styles.breakingPointBanner} style={{ width: '100%', marginTop: '12px' }}>
            <AlertTriangle size={20} />
            <div>
              <strong>Titik Kegagalan (Breaking Point) Terdeteksi: </strong>
              Server mulai mengalami error atau timeout signifikan pada throughput sekitar{' '}
              <strong>{breakingPoint.atRps} req/s</strong>.
              Penyebab: <em>{breakingPoint.reason}</em>
            </div>
          </div>
        ) : (
          <div style={{ width: '100%', marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', fontSize: '0.88rem', fontWeight: 600 }}>
            <CheckCircle2 size={18} />
            Server tidak mencapai titik kegagalan (breaking point) pada volume beban ini. Performa respon stabil!
          </div>
        )}

        {/* Action Bar for Report (Export, Copy) */}
        <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '14px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={styles.exportBtn}
            onClick={downloadJSON}
          >
            <Download size={15} />
            Unduh JSON Telemetri
          </button>
          <button
            type="button"
            className={styles.exportBtn}
            onClick={downloadMarkdownReport}
          >
            <FileCode size={15} />
            Unduh Markdown Report
          </button>
          <button
            type="button"
            className={styles.exportBtn}
            onClick={() => handleCopy(JSON.stringify(stressResult, null, 2), 'stress-json')}
          >
            {copiedId === 'stress-json' ? <Check size={15} /> : <Copy size={15} />}
            {copiedId === 'stress-json' ? 'Tersalin!' : 'Salin JSON Data'}
          </button>
        </div>
      </div>

      {/* Latency Percentiles Grid */}
      <div className={styles.latencyGrid}>
        <div className={styles.latencyCard}>
          <div className={styles.latencyCardTitle}>Min Latency</div>
          <div className={styles.latencyCardMs}>{latency.min ?? '-'}ms</div>
        </div>
        <div className={styles.latencyCard}>
          <div className={styles.latencyCardTitle}>Average Latency</div>
          <div className={styles.latencyCardMs} style={{ color: '#38bdf8' }}>
            {latency.avg ?? '-'}ms
          </div>
        </div>
        <div className={styles.latencyCard}>
          <div className={styles.latencyCardTitle}>Median (p50)</div>
          <div className={styles.latencyCardMs}>{latency.p50 ?? '-'}ms</div>
        </div>
        <div className={styles.latencyCard}>
          <div className={styles.latencyCardTitle}>90th Percentile (p90)</div>
          <div className={styles.latencyCardMs} style={{ color: '#fbbf24' }}>
            {latency.p90 ?? '-'}ms
          </div>
        </div>
        <div className={styles.latencyCard}>
          <div className={styles.latencyCardTitle}>95th Percentile (p95)</div>
          <div className={styles.latencyCardMs} style={{ color: '#f87171' }}>
            {latency.p95 ?? '-'}ms
          </div>
        </div>
        <div className={styles.latencyCard}>
          <div className={styles.latencyCardTitle}>99th Percentile (p99)</div>
          <div className={styles.latencyCardMs} style={{ color: '#ef4444', fontWeight: 800 }}>
            {latency.p99 ?? '-'}ms
          </div>
        </div>
        <div className={styles.latencyCard}>
          <div className={styles.latencyCardTitle}>Max Latency</div>
          <div className={styles.latencyCardMs}>{latency.max ?? '-'}ms</div>
        </div>
      </div>

      {/* HTTP Status Code & Error Distribution */}
      <div className={styles.diagnosticCard}>
        <div className={styles.diagnosticTitle}>
          <BarChart2 size={18} style={{ color: '#38bdf8' }} />
          Distribusi Respon HTTP & Status Kode
        </div>
        <div className={styles.statusPillsWrap} style={{ marginBottom: '16px' }}>
          {Object.entries(statusCodes).map(([code, count]) => {
            const is2xx = code.startsWith('2');
            const is3xx = code.startsWith('3');
            const is4xx = code.startsWith('4');
            const is5xx = code.startsWith('5');
            const pillClass = is2xx ? styles.statusPill2xx : is3xx ? styles.statusPill3xx : is4xx ? styles.statusPill4xx : is5xx ? styles.statusPill5xx : styles.statusPillErr;
            return (
              <span key={code} className={`${styles.statusPill} ${pillClass}`} style={{ fontSize: '0.85rem', padding: '6px 14px' }}>
                HTTP {code}: <strong>{count.toLocaleString()}</strong> ({((count / (stressResult.completedTotal || 1)) * 100).toFixed(1)}%)
              </span>
            );
          })}
        </div>

        {/* Errors table if any error occurred */}
        {(errorsSummary.length > 0 || Object.keys(networkErrors).length > 0) && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f87171', marginBottom: '8px' }}>
              Daftar Kegagalan Jaringan & Server Error:
            </div>
            <table className={styles.errorTable}>
              <thead>
                <tr>
                  <th>Tipe / Kode</th>
                  <th>Deskripsi Masalah</th>
                  <th>Frekuensi Kejadian</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(networkErrors).map(([errType, count]) => (
                  <tr key={errType}>
                    <td style={{ color: '#f87171', fontWeight: 700 }}>{errType}</td>
                    <td>Network Level Failure / Socket Timeout / Connection Reset</td>
                    <td style={{ fontWeight: 700, color: '#f87171' }}>{count} kali</td>
                  </tr>
                ))}
                {errorsSummary.slice(0, 8).map((err, idx) => (
                  <tr key={idx}>
                    <td style={{ color: '#fbbf24' }}>Sample #{idx + 1}</td>
                    <td>{err.error || `HTTP Status Code ${err.status}`}</td>
                    <td>Latensi: {err.latency}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Server Bottlenecks Analysis */}
      {bottlenecks.length > 0 && (
        <div className={styles.diagnosticCard}>
          <div className={styles.diagnosticTitle}>
            <Cpu size={18} style={{ color: '#fbbf24' }} />
            Analisis Titik Lemah & Bottleneck Server
          </div>
          <div className={styles.bottleneckList}>
            {bottlenecks.map((b, idx) => (
              <div key={idx} className={styles.bottleneckRow}>
                <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: '2px', color: '#f87171' }} />
                <div>
                  <div style={{ fontWeight: 700, color: '#ffffff', marginBottom: '2px' }}>{b.category}</div>
                  <div style={{ marginBottom: '4px' }}>{b.detail}</div>
                  <div style={{ fontSize: '0.8rem', color: '#fecaca', fontStyle: 'italic' }}>Dampak: {b.impact}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Developer Remediation Checklist */}
      {recommendations.length > 0 && (
        <div className={styles.diagnosticCard} style={{ borderColor: 'rgba(52, 211, 153, 0.3)' }}>
          <div className={styles.diagnosticTitle} style={{ color: '#34d399' }}>
            <ListChecks size={18} />
            Checklist Optimasi Developer (Solusi Mencegah Server Down Saat Trafik Tinggi)
          </div>
          <div>
            {recommendations.map((rec, idx) => (
              <div key={idx} className={styles.checklistRow}>
                <div
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    background: rec.priority === 'CRITICAL' ? 'rgba(239, 68, 68, 0.2)' : rec.priority === 'HIGH' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                    color: rec.priority === 'CRITICAL' ? '#f87171' : rec.priority === 'HIGH' ? '#fbbf24' : '#60a5fa',
                    border: `1px solid ${rec.priority === 'CRITICAL' ? 'rgba(239, 68, 68, 0.4)' : rec.priority === 'HIGH' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(59, 130, 246, 0.4)'}`,
                    alignSelf: 'flex-start',
                    marginTop: '2px'
                  }}
                >
                  {rec.priority}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: '#ffffff', marginBottom: '3px' }}>{rec.action}</div>
                  <div style={{ fontSize: '0.85rem', color: '#a7f3d0' }}>{rec.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
