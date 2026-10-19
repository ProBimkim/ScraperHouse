'use client';

import React, { useState } from 'react';
import styles from './AccountTakeoverAssessmentCard.module.css';
import {
  ShieldAlert,
  KeyRound,
  Users,
  Bot,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Server,
  Layers,
  Database,
  Lock,
  ListFilter,
  Copy,
  Check
} from 'lucide-react';

export default function AccountTakeoverAssessmentCard({ assessment }) {
  const [copiedKey, setCopiedKey] = useState(null);

  if (!assessment || !assessment.executed) return null;

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const overallRisk = assessment.overallAtoRisk || 'LOW';
  const badgeClass =
    overallRisk === 'CRITICAL' ? styles.atoCrit :
    overallRisk === 'HIGH' ? styles.atoHigh :
    overallRisk === 'MODERATE' ? styles.atoMed : styles.atoLow;

  const comparison = assessment.threatComparisonMatrix || [];
  const profiling = assessment.requestProfiling || {};
  const rateLimit = assessment.rateLimitingEvaluation || {};
  const botProtect = assessment.botProtectionEvaluation || {};
  const respAnalysis = assessment.responseAnalysis || {};
  const remediationPlan = assessment.developerRemediationPlan || [];
  const monitored = profiling.monitoredEndpoints || [];
  const credsList = assessment.discoveredAdminCredentials || [];

  return (
    <div className={styles.atoContainer}>
      {/* Header */}
      <div className={styles.atoHeader}>
        <div className={styles.atoTitle}>
          <ShieldAlert size={22} style={{ color: '#c084fc' }} />
          Audit Keamanan: Pengujian Ketahanan Autentikasi (Account Takeover Assessment)
        </div>
        <div className={`${styles.atoBadge} ${badgeClass}`}>
          <AlertTriangle size={15} />
          Risiko ATO: {overallRisk}
        </div>
      </div>

      {/* Hero Summary */}
      <div className={styles.atoHero}>
        <div className={styles.atoHeroSummary}>
          {assessment.executiveSummary}
        </div>
        <div className={styles.atoMetaRow}>
          <span>
            Endpoint Target Autentikasi: <strong style={{ color: '#38bdf8' }}>{assessment.targetUrl}</strong>
          </span>
          <span>•</span>
          <span>
            Field Identitas: <strong style={{ color: 'var(--text-main)' }}>{profiling.accountIdentifierField}</strong>
          </span>
          <span>•</span>
          <span>
            Field Kredensial: <strong style={{ color: 'var(--text-main)' }}>{profiling.credentialField}</strong>
          </span>
          <span>•</span>
          <span>
            Proteksi Anti-CSRF: <strong style={{ color: profiling.csrfProtectionDeclared ? '#34d399' : '#f87171' }}>{profiling.csrfProtectionDeclared ? 'Tersedia' : 'Tidak Terdeteksi'}</strong>
          </span>
        </div>
      </div>

      {/* Temuan Kredensial & Akun Admin Teridentifikasi (Tanpa Terpotong) */}
      {credsList.length > 0 && (
        <div className={styles.credsContainer}>
          <div className={styles.credsHeader}>
            <div className={styles.credsTitle}>
              <KeyRound size={20} style={{ color: '#ef4444' }} />
              Temuan Kredensial &amp; Akun Admin Teridentifikasi (Account Takeover Evidence)
            </div>
            <span className={styles.credsBadgeCritical}>
              {credsList.length} Kredensial Admin Terpapar
            </span>
          </div>
          <p className={styles.credsSubtitle}>
            Hasil audit keamanan dan simulasi pengujian ketahanan autentikasi mengidentifikasi pasangan akun dan kata sandi administratif berikut secara lengkap tanpa sensor/pemotongan:
          </p>
          <div className={styles.tableWrapper}>
            <table className={styles.credsTable}>
              <thead>
                <tr>
                  <th>Tipe Akun</th>
                  <th>Username / Akun Sasaran</th>
                  <th>Password Teridentifikasi (Cleartext)</th>
                  <th>Password Hash / Sample</th>
                  <th>Endpoint Terkena Dampak</th>
                  <th>Metode Temuan</th>
                  <th>Status &amp; Bukti</th>
                </tr>
              </thead>
              <tbody>
                {credsList.map((cred, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 700, color: '#fca5a5' }}>{cred.accountType}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <code className={styles.credCodeHighlight}>{cred.targetAccount}</code>
                        <button
                          type="button"
                          onClick={() => handleCopy(cred.targetAccount, `usr_${idx}`)}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                          title="Copy username"
                        >
                          {copiedKey === `usr_${idx}` ? <Check size={14} style={{ color: '#34d399' }} /> : <Copy size={14} />}
                        </button>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <code className={styles.credCodePassword}>{cred.passwordCleartext}</code>
                        <button
                          type="button"
                          onClick={() => handleCopy(cred.passwordCleartext, `pwd_${idx}`)}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                          title="Copy password"
                        >
                          {copiedKey === `pwd_${idx}` ? <Check size={14} style={{ color: '#34d399' }} /> : <Copy size={14} />}
                        </button>
                      </div>
                    </td>
                    <td>
                      <code className={styles.credCodeHash}>{cred.passwordHash}</code>
                    </td>
                    <td>
                      <span className={styles.credEndpointTag}>{cred.authEndpoint}</span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{cred.discoveryMethod}</td>
                    <td>
                      <span className={styles.credStatusBadge}>{cred.status}</span>
                      <div style={{ fontSize: '0.75rem', color: '#fca5a5', marginTop: '4px' }}>
                        {cred.evidenceDetails}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Vektor Ancaman: Brute-Force vs. Credential Stuffing Table */}
      <div className={styles.sectionTitle}>
        <KeyRound size={18} />
        Perbandingan Vektor Ancaman: Brute-Force vs. Credential Stuffing
      </div>
      <div className={styles.tableWrapper}>
        <table className={styles.threatTable}>
          <thead>
            <tr>
              <th style={{ width: '22%' }}>Parameter</th>
              <th style={{ width: '26%' }}>Brute-Force</th>
              <th style={{ width: '28%' }}>Credential Stuffing</th>
              <th style={{ width: '24%' }}>Konteks Teknis &amp; Dampak</th>
            </tr>
          </thead>
          <tbody>
            {comparison.map((item, idx) => (
              <tr key={idx}>
                <td style={{ fontWeight: 700, color: 'var(--text-main)' }}>{item.parameter}</td>
                <td>{item.bruteForce}</td>
                <td style={{ color: '#e9d5ff' }}>{item.credentialStuffing}</td>
                <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.technicalContext}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 4-Box Audit Grid */}
      <div className={styles.auditGrid}>
        {/* Card 1: Request Profiling & Monitored Auth Endpoints */}
        <div className={styles.auditCard}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>
              <Server size={16} style={{ color: '#38bdf8' }} />
              1. Endpoint Autentikasi Terpantau
            </div>
            <span className={`${styles.statusPill} ${monitored.some(e => e.isApiEndpoint) ? styles.pillWarning : styles.pillSafe}`}>
              {monitored.length} Endpoint
            </span>
          </div>
          <div className={styles.cardBodyText}>
            Memetakan antarmuka login web utama serta jalur REST API pendukung (Mobile / Backend API) yang rentan memiliki kebijakan keamanan lebih longgar.
          </div>
          <div className={styles.endpointsRow}>
            {monitored.map((ep, i) => (
              <span key={i} className={styles.endpointTag}>
                [{ep.method}] {ep.path}
                {ep.isApiEndpoint && (
                  <span style={{ fontSize: '0.68rem', color: '#fb923c', fontWeight: 700 }}>
                    API
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>

        {/* Card 2: Rate Limiting & Distributed Evasion */}
        <div className={styles.auditCard}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>
              <Activity size={16} style={{ color: '#f87171' }} />
              2. Evaluasi Pembatasan Laju Akses (Rate Limiting)
            </div>
            <span className={`${styles.statusPill} ${rateLimit.distributedEvasionSusceptible ? styles.pillDanger : styles.pillSafe}`}>
              {rateLimit.distributedEvasionSusceptible ? 'DISTRIBUTED EVASION' : 'PROTECTED'}
            </span>
          </div>
          <div className={styles.cardBodyText}>
            <strong>Throttling IP Tunggal: </strong>{rateLimit.singleIpThreshold}
          </div>
          <div className={styles.cardBodyText} style={{ color: rateLimit.distributedEvasionSusceptible ? '#fca5a5' : '#a7f3d0' }}>
            <strong>Ketahanan Terdistribusi (Multi-IP/Proxy): </strong>{rateLimit.wafDistributedDetection}
          </div>
        </div>

        {/* Card 3: Bot Protection & CAPTCHA */}
        <div className={styles.auditCard}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>
              <Bot size={16} style={{ color: '#fbbf24' }} />
              3. Mekanisme Proteksi Otomatisasi (Bot &amp; CAPTCHA)
            </div>
            <span className={`${styles.statusPill} ${botProtect.captchaDetected ? styles.pillSafe : styles.pillWarning}`}>
              {botProtect.captchaProvider}
            </span>
          </div>
          <div className={styles.cardBodyText}>
            <strong>Challenge-Response: </strong>{botProtect.challengeResponseMechanism}
          </div>
          <div className={styles.cardBodyText}>
            <strong>Respon Headless Automation: </strong>{botProtect.notes}
          </div>
        </div>

        {/* Card 4: Response Analysis & Username Enumeration */}
        <div className={styles.auditCard}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>
              <Users size={16} style={{ color: '#a855f7' }} />
              4. Analisis Respons &amp; Username Enumeration (CWE-204)
            </div>
            <span className={`${styles.statusPill} ${respAnalysis.usernameEnumerationVulnerable ? styles.pillDanger : styles.pillSafe}`}>
              {respAnalysis.usernameEnumerationVulnerable ? 'ENUMERATION LEAK' : 'UNIFIED RESPONSE'}
            </span>
          </div>
          <div className={styles.cardBodyText}>
            <strong>Vektor Pembocoran: </strong>{respAnalysis.enumerationVector}
          </div>
          <div className={styles.cardBodyText}>
            <strong>Discrepancy Waktu (Timing Delta): </strong>{respAnalysis.timingDiscrepancyMs}ms
          </div>
          <div className={styles.cardBodyText} style={{ color: respAnalysis.usernameEnumerationVulnerable ? '#fca5a5' : '#a7f3d0' }}>
            {respAnalysis.analysisConclusion}
          </div>
        </div>
      </div>

      {/* Developer Remediation Action Items */}
      {remediationPlan.length > 0 && (
        <div className={styles.actionItemsBox}>
          <div className={styles.actionTitle}>
            <Lock size={18} />
            Checklist Tim Pengembang: Rekomendasi Penguatan Pertahanan ATO &amp; Autentikasi
          </div>
          <div className={styles.actionGrid}>
            {remediationPlan.map((item, idx) => (
              <div key={idx} className={styles.actionItem}>
                <div className={styles.actionItemHead}>
                  <span className={styles.actionItemTitle}>{item.action}</span>
                  <span className={styles.actionPriority}>{item.priority}</span>
                </div>
                <div className={styles.actionItemDesc}>{item.details}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
