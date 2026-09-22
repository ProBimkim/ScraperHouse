'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageSquare, Edit2, Check, X, Loader2 } from 'lucide-react';

export default function CommentBox({ slug, questionId, initialText = '' }) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(initialText);
  const [tempText, setTempText] = useState(initialText);
  const [status, setStatus] = useState('idle'); // idle, saving, saved, error
  const textareaRef = useRef(null);

  useEffect(() => {
    setText(initialText);
    setTempText(initialText);
  }, [initialText]);

  // Auto-resize textarea
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      textareaRef.current.focus();
    }
  }, [isEditing, tempText]);

  const handleSave = async () => {
    if (tempText === text && text !== '') {
      setIsEditing(false);
      return;
    }

    setStatus('saving');
    try {
      const res = await fetch(`/api/scraper/${slug}/comments`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ questionId, text: tempText }),
      });

      if (!res.ok) throw new Error('Gagal menyimpan komentar');
      
      const data = await res.json();
      if (data.success) {
        setText(tempText);
        setStatus('saved');
        setIsEditing(false);
        setTimeout(() => setStatus('idle'), 3000);
      } else {
        throw new Error(data.error || 'Terjadi kesalahan');
      }
    } catch (error) {
      console.error(error);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 4000);
    }
  };

  const handleCancel = () => {
    setTempText(text);
    setIsEditing(false);
    setStatus('idle');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      handleCancel();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSave();
    }
  };

  if (isEditing) {
    return (
      <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px dashed var(--border)' }}>
        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 10px 10px 24px' }}>
          <textarea
            ref={textareaRef}
            className="input-field"
            placeholder="Tambahkan catatan atau komentar untuk soal ini..."
            value={tempText}
            onChange={(e) => setTempText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={status === 'saving'}
            rows={1}
            style={{ 
              flex: 1, 
              resize: 'none', 
              background: 'transparent', 
              border: 'none', 
              color: 'var(--text-main)', 
              fontSize: '1.05rem', 
              outline: 'none', 
              padding: '12px 0',
              minHeight: '24px',
              overflow: 'hidden'
            }}
          />
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {status === 'error' && (
              <span style={{ color: 'var(--error)', fontSize: '0.85rem', marginRight: '8px' }}>⚠️ Gagal</span>
            )}
            <button 
              className="btn btn-ghost" 
              onClick={handleCancel}
              disabled={status === 'saving'}
              style={{ padding: '12px 20px' }}
            >
              Batal
            </button>
            <button 
              className="btn btn-primary" 
              onClick={handleSave}
              disabled={status === 'saving'}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px' }}
            >
              {status === 'saving' ? (
                <><Loader2 size={18} className="spinner" /> Menyimpan...</>
              ) : (
                <><Check size={18} /> Simpan</>
              )}
            </button>
          </div>
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'right' }}>
          Tekan <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>Ctrl + Enter</kbd> untuk simpan
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px dashed var(--border)' }}>
      <div 
        className="glass-card"
        style={{ padding: '12px 16px', cursor: 'pointer', transition: 'all 0.2s ease' }}
        onClick={() => setIsEditing(true)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
          <MessageSquare size={14} />
          <span>Komentar & Catatan</span>
          {status === 'saved' && (
            <span style={{ marginLeft: 'auto', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
              <Check size={14} /> Tersimpan
            </span>
          )}
          {status === 'idle' && text && (
            <span style={{ marginLeft: 'auto', opacity: 0.5 }}>
              <Edit2 size={12} /> Klik untuk edit
            </span>
          )}
        </div>
        
        {text ? (
          <div style={{ fontSize: '0.95rem', lineHeight: '1.5', color: 'var(--text-main)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {text}
          </div>
        ) : (
          <div style={{ fontSize: '0.95rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Belum ada komentar. Klik di sini untuk menambahkan catatan...
          </div>
        )}
      </div>
    </div>
  );
}
