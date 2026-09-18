'use client';

import { useState, useEffect, useRef } from 'react';
import Navbar from '@/components/Navbar';
import styles from './page.module.css';
import {
  GitGraph,
  Search,
  Sparkles,
  Download,
  Copy,
  Check,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Key,
  FolderGit2,
  Star,
  GitFork,
  ExternalLink,
  AlertCircle,
  FileText,
  Code2,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export default function GitDiagramPage() {
  const [url, setUrl] = useState('');
  const [focus, setFocus] = useState('');
  const [token, setToken] = useState('');
  const [groqApiKey, setGroqApiKey] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);

  // Load saved keys from localStorage on mount
  useEffect(() => {
    try {
      const savedGroq = localStorage.getItem('gitdiagram_groq_key');
      if (savedGroq) setGroqApiKey(savedGroq);
      const savedGh = localStorage.getItem('gitdiagram_gh_token');
      if (savedGh) setToken(savedGh);
    } catch {}
  }, []);

  const handleSaveGroqKey = (val) => {
    setGroqApiKey(val);
    try {
      localStorage.setItem('gitdiagram_groq_key', val);
    } catch {}
  };

  const handleSaveGhToken = (val) => {
    setToken(val);
    try {
      localStorage.setItem('gitdiagram_gh_token', val);
    } catch {}
  };

  // Generation state
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  // Result state
  const [repoInfo, setRepoInfo] = useState(null);
  const [mermaidCode, setMermaidCode] = useState('');
  const [fullText, setFullText] = useState('');
  const [analyzedFiles, setAnalyzedFiles] = useState([]);
  const [activeTab, setActiveTab] = useState('diagram');
  const [copied, setCopied] = useState(false);
  const [renderError, setRenderError] = useState(null);

  // Zoom / Pan state
  const [zoom, setZoom] = useState(1);
  const svgContainerRef = useRef(null);
  const canvasRef = useRef(null);

  // Initialize Mermaid on mount
  useEffect(() => {
    import('mermaid').then((m) => {
      const mermaid = m.default;
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        themeVariables: {
          darkMode: true,
          background: '#0a0e23',
          primaryColor: '#1e293b',
          primaryBorderColor: '#3b82f6',
          primaryTextColor: '#f8fafc',
          lineColor: '#60a5fa',
          secondaryColor: '#0f172a',
          tertiaryColor: '#1e1b4b',
        },
        securityLevel: 'loose',
        flowchart: {
          useMaxWidth: false,
          htmlLabels: true,
          curve: 'basis',
        },
      });
    });
  }, []);

  // Re-render Mermaid diagram whenever mermaidCode changes
  useEffect(() => {
    if (!mermaidCode || !svgContainerRef.current) return;

    let isMounted = true;
    setRenderError(null);

    import('mermaid')
      .then(async (m) => {
        const mermaid = m.default;
        const renderId = 'mermaid-graph-' + Math.random().toString(36).substring(2, 9);
        try {
          // Clean up previous SVG
          svgContainerRef.current.innerHTML = '';
          const { svg } = await mermaid.render(renderId, mermaidCode);
          if (isMounted && svgContainerRef.current) {
            svgContainerRef.current.innerHTML = svg;
          }
        } catch (err) {
          console.error('Mermaid render error:', err);
          if (isMounted) {
            setRenderError(err.message || 'Failed to parse and render Mermaid diagram syntax.');
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load mermaid:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [mermaidCode]);

  // Handle SSE streaming generation
  const handleGenerate = async (e) => {
    if (e) e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setRenderError(null);
    setProgress(5);
    setStatusMessage('Initiating architecture analysis...');
    setRepoInfo(null);
    setMermaidCode('');
    setFullText('');
    setAnalyzedFiles([]);
    setActiveTab('diagram');
    setZoom(1);

    try {
      const response = await fetch('/api/gitdiagram/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          focus: focus.trim(),
          token: token.trim(),
          groqApiKey: groqApiKey.trim(),
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to start diagram generation');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        let currentEvent = 'message';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.replace('event: ', '').trim();
          } else if (line.startsWith('data: ')) {
            const rawData = line.replace('data: ', '').trim();
            if (!rawData) continue;

            try {
              const data = JSON.parse(rawData);

              if (currentEvent === 'status') {
                if (data.message) setStatusMessage(data.message);
                if (data.progress) setProgress(data.progress);
                if (data.analyzedFiles) setAnalyzedFiles(data.analyzedFiles);
              } else if (currentEvent === 'chunk') {
                setFullText((prev) => prev + (data.chunk || ''));
              } else if (currentEvent === 'done') {
                setProgress(100);
                setStatusMessage('Architecture diagram generated successfully!');
                if (data.mermaid) setMermaidCode(data.mermaid);
                if (data.fullText) setFullText(data.fullText);
                if (data.repoInfo) setRepoInfo(data.repoInfo);
                if (data.analyzedFiles) setAnalyzedFiles(data.analyzedFiles);
              } else if (currentEvent === 'error') {
                throw new Error(data.message || 'Generation failed');
              }
            } catch (pErr) {
              if (currentEvent === 'error') {
                throw pErr;
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'An error occurred during diagram generation.');
    } finally {
      setLoading(false);
    }
  };

  // Zoom helpers
  const handleZoomIn = () => setZoom((z) => Math.min(Number((z + 0.15).toFixed(2)), 3.0));
  const handleZoomOut = () => setZoom((z) => Math.max(Number((z - 0.15).toFixed(2)), 0.3));
  const handleZoomReset = () => setZoom(1);

  // Copy Mermaid Code
  const handleCopyCode = () => {
    if (!mermaidCode) return;
    navigator.clipboard.writeText(mermaidCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Export SVG
  const handleDownloadSvg = () => {
    if (!svgContainerRef.current) return;
    const svgEl = svgContainerRef.current.querySelector('svg');
    if (!svgEl) return;

    const svgData = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `${repoInfo?.name || 'architecture'}-diagram.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  };

  // Export PNG
  const handleDownloadPng = () => {
    if (!svgContainerRef.current) return;
    const svgEl = svgContainerRef.current.querySelector('svg');
    if (!svgEl) return;

    const svgData = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const URLObject = window.URL || window.webkitURL || window;
    const blobURL = URLObject.createObjectURL(svgBlob);

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const bbox = svgEl.getBoundingClientRect();
      const scale = 2; // High resolution
      canvas.width = (bbox.width || 1200) * scale;
      canvas.height = (bbox.height || 800) * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0a0e23';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(image, 0, 0);

      const pngUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = `${repoInfo?.name || 'architecture'}-diagram.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URLObject.revokeObjectURL(blobURL);
    };
    image.src = blobURL;
  };

  // Fullscreen Canvas toggle
  const handleToggleFullscreen = () => {
    if (!canvasRef.current) return;
    if (!document.fullscreenElement) {
      canvasRef.current.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  // Clean Markdown overview (removes mermaid code block so only explanation is shown)
  const architectureOverview = fullText ? fullText.replace(/```mermaid[\s\S]*?```/i, '').trim() : '';

  return (
    <>
      <Navbar />
      <div className="container">
        <div className={styles.pageWrapper}>
          {/* Header */}
          <div className={styles.headerSection}>
            <div className={styles.badge}>
              <GitGraph size={14} />
              AI System Architecture
            </div>
            <h1 className={styles.title}>GitDiagram Visualizer</h1>
            <p className={styles.subtitle}>
              Turn any GitHub repository into an interactive Mermaid.js architecture diagram in seconds. Deeply analyzes structure, configurations, and core source code files.
            </p>
          </div>

          {/* Control Card */}
          <div className={styles.controlCard}>
            <form onSubmit={handleGenerate} className={styles.formGrid}>
              <div className={styles.inputRow}>
                <div className={styles.inputWrapper}>
                  <FolderGit2 className={styles.inputIcon} size={20} />
                  <input
                    type="text"
                    placeholder="Enter GitHub URL (e.g. https://github.com/expressjs/express or owner/repo)"
                    className={styles.repoInput}
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <button
                  type="submit"
                  className="btn-liquid"
                  disabled={loading || !url.trim()}
                >
                  <Sparkles size={18} />
                  {loading ? 'Analyzing...' : 'Generate Diagram'}
                </button>
              </div>

              {/* Additional Options */}
              <div className={styles.optionsRow}>
                <input
                  type="text"
                  placeholder="Focus area (optional: e.g. 'Authentication Flow', 'API Pipeline')"
                  className={styles.focusInput}
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                  disabled={loading}
                />

                <button
                  type="button"
                  className={styles.tokenToggleBtn}
                  onClick={() => setShowTokenInput(!showTokenInput)}
                >
                  <Key size={14} />
                  API Keys & Settings
                  {showTokenInput ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>

              {/* API Keys Collapsible */}
              {showTokenInput && (
                <div className={styles.tokenInputWrapper}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '4px', fontWeight: 600 }}>
                        Groq AI API Key (Optional / Overrides Server):
                      </label>
                      <input
                        type="password"
                        placeholder="Paste Groq API Key (gsk_...) - Saved in browser"
                        className={styles.focusInput}
                        style={{ width: '100%' }}
                        value={groqApiKey}
                        onChange={(e) => handleSaveGroqKey(e.target.value)}
                      />
                      <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                        Default uses server key. If server key is expired, paste your own free key. Don't have one?{' '}
                        <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" style={{ color: '#60a5fa', textDecoration: 'underline' }}>
                          Get a free Groq API key
                        </a>.
                      </p>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '4px', fontWeight: 600 }}>
                        GitHub Personal Access Token (Optional):
                      </label>
                      <input
                        type="password"
                        placeholder="Paste GitHub Token (ghp_...) - Avoids 60 req/hr rate limits"
                        className={styles.focusInput}
                        style={{ width: '100%' }}
                        value={token}
                        onChange={(e) => handleSaveGhToken(e.target.value)}
                      />
                      <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                        Increases GitHub REST API limits from 60 to 5,000 requests/hr. Saved securely in your browser.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Presets */}
              <div className={styles.presetsRow}>
                <span>Quick samples:</span>
                <button
                  type="button"
                  className={styles.presetPill}
                  onClick={() => setUrl('https://github.com/expressjs/express')}
                >
                  expressjs/express
                </button>
                <button
                  type="button"
                  className={styles.presetPill}
                  onClick={() => setUrl('https://github.com/fastapi/fastapi')}
                >
                  fastapi/fastapi
                </button>
                <button
                  type="button"
                  className={styles.presetPill}
                  onClick={() => setUrl('https://github.com/ahmedkhaleel2004/gitdiagram')}
                >
                  ahmedkhaleel2004/gitdiagram
                </button>
                <button
                  type="button"
                  className={styles.presetPill}
                  onClick={() => setUrl('https://github.com/pallets/flask')}
                >
                  pallets/flask
                </button>
              </div>
            </form>
          </div>

          {/* Progress / Status Bar */}
          {loading && (
            <div className={styles.progressCard}>
              <div className={styles.progressInfo}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={16} className="spin" style={{ color: '#60a5fa' }} />
                  {statusMessage}
                </span>
                <span style={{ fontWeight: 600, color: '#93c5fd' }}>{progress}%</span>
              </div>
              <div className={styles.progressBarBg}>
                <div className={styles.progressBarFill} style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '16px',
                padding: '16px 20px',
                color: '#fca5a5',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <AlertCircle size={24} style={{ flexShrink: 0 }} />
              <div>
                <strong>Generation Error:</strong> {error}
              </div>
            </div>
          )}

          {/* Repo Info Header Banner */}
          {repoInfo && (
            <div className={styles.repoBanner}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <FolderGit2 size={24} style={{ color: '#60a5fa' }} />
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f8fafc' }}>
                    {repoInfo.fullName}
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                    {repoInfo.description}
                  </p>
                </div>
              </div>

              <div className={styles.repoMeta}>
                <span className={styles.repoMetaItem}>
                  <Star size={14} style={{ color: '#fbbf24' }} /> {repoInfo.stars?.toLocaleString()}
                </span>
                <span className={styles.repoMetaItem}>
                  <GitFork size={14} style={{ color: '#94a3b8' }} /> {repoInfo.forks?.toLocaleString()}
                </span>
                <span className={styles.repoMetaItem}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#34d399',
                      display: 'inline-block',
                    }}
                  />
                  {repoInfo.language}
                </span>
                <a
                  href={`https://github.com/${repoInfo.fullName}`}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.presetPill}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  GitHub <ExternalLink size={12} />
                </a>
              </div>
            </div>
          )}

          {/* Diagram Canvas Section */}
          {(mermaidCode || loading) && (
            <div className={styles.canvasCard} ref={canvasRef}>
              {/* Toolbar */}
              <div className={styles.canvasToolbar}>
                <div className={styles.toolbarGroup}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={handleZoomIn}
                    title="Zoom In"
                  >
                    <ZoomIn size={18} />
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={handleZoomOut}
                    title="Zoom Out"
                  >
                    <ZoomOut size={18} />
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={handleZoomReset}
                    title="Reset Zoom (100%)"
                  >
                    <RotateCcw size={16} />
                  </button>
                  <span style={{ fontSize: '0.82rem', color: '#94a3b8', marginLeft: '4px' }}>
                    {Math.round(zoom * 100)}%
                  </span>
                </div>

                <div className={styles.toolbarGroup}>
                  <button
                    type="button"
                    className="btn-liquid btn-liquid-sm"
                    onClick={handleCopyCode}
                    title="Copy Mermaid Code"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied' : 'Copy Code'}
                  </button>

                  <button
                    type="button"
                    className="btn-liquid-accent btn-liquid-sm"
                    onClick={handleDownloadSvg}
                    title="Download Vector SVG"
                  >
                    <Download size={14} />
                    SVG
                  </button>

                  <button
                    type="button"
                    className="btn-liquid btn-liquid-sm"
                    onClick={handleDownloadPng}
                    title="Download PNG image"
                  >
                    <Download size={14} />
                    PNG
                  </button>

                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={handleToggleFullscreen}
                    title="Toggle Fullscreen"
                  >
                    <Maximize2 size={16} />
                  </button>
                </div>
              </div>

              {/* Viewport */}
              <div className={styles.diagramViewport}>
                {renderError ? (
                  <div
                    style={{
                      maxWidth: '500px',
                      textAlign: 'center',
                      color: '#fca5a5',
                      padding: '24px',
                      background: 'rgba(239, 68, 68, 0.1)',
                      borderRadius: '16px',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                    }}
                  >
                    <AlertCircle size={36} style={{ marginBottom: '12px' }} />
                    <h4 style={{ color: '#f87171', marginBottom: '8px' }}>Mermaid Render Notice</h4>
                    <p style={{ fontSize: '0.85rem', marginBottom: '16px' }}>{renderError}</p>
                    <p style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                      You can view and copy the raw Mermaid code in the "Mermaid Code" tab below.
                    </p>
                  </div>
                ) : (
                  <div
                    className={styles.svgContainer}
                    ref={svgContainerRef}
                    style={{ transform: `scale(${zoom})` }}
                  />
                )}
              </div>
            </div>
          )}

          {/* Details & Architecture Breakdown Tabs */}
          {(fullText || analyzedFiles.length > 0) && (
            <div className={styles.detailsCard}>
              <div className={styles.tabsHeader}>
                <button
                  type="button"
                  className={`${styles.tabItem} ${activeTab === 'diagram' ? styles.tabItemActive : ''}`}
                  onClick={() => setActiveTab('diagram')}
                >
                  <Layers size={16} />
                  Architecture Overview
                </button>
                <button
                  type="button"
                  className={`${styles.tabItem} ${activeTab === 'code' ? styles.tabItemActive : ''}`}
                  onClick={() => setActiveTab('code')}
                >
                  <Code2 size={16} />
                  Mermaid Source
                </button>
                <button
                  type="button"
                  className={`${styles.tabItem} ${activeTab === 'files' ? styles.tabItemActive : ''}`}
                  onClick={() => setActiveTab('files')}
                >
                  <FileText size={16} />
                  Files Analyzed ({analyzedFiles.length})
                </button>
              </div>

              <div className={styles.tabContent}>
                {activeTab === 'diagram' && (
                  <div className={styles.markdownArea}>
                    {architectureOverview ? (
                      <div style={{ whiteSpace: 'pre-line' }}>{architectureOverview}</div>
                    ) : (
                      <p style={{ color: '#94a3b8' }}>Generating architecture breakdown...</p>
                    )}
                  </div>
                )}

                {activeTab === 'code' && (
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '10px',
                      }}
                    >
                      <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                        Raw Mermaid Graph Syntax
                      </span>
                      <button
                        type="button"
                        className="btn-liquid btn-liquid-sm"
                        onClick={handleCopyCode}
                      >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <pre className={styles.codeBox}>{mermaidCode || 'No Mermaid code generated yet.'}</pre>
                  </div>
                )}

                {activeTab === 'files' && (
                  <div>
                    <p style={{ fontSize: '0.88rem', color: '#cbd5e1', marginBottom: '14px' }}>
                      The AI inspected the following key architectural configs and source code files to achieve high diagram accuracy:
                    </p>
                    <div className={styles.filesList}>
                      {analyzedFiles.map((file, idx) => (
                        <div key={idx} className={styles.fileItem}>
                          <FileText size={14} />
                          <span>{file}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
