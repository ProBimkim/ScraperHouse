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
      <div className="comment-section">
        <div className="comment-box-edit">
          <textarea
            ref={textareaRef}
            className="comment-textarea"
            placeholder="Tambahkan catatan atau komentar untuk soal ini..."
            value={tempText}
            onChange={(e) => setTempText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={status === 'saving'}
          />
          
          <div className="comment-actions">
            <span className="comment-status" style={{ marginRight: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Tekan <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>Ctrl + Enter</kbd> untuk simpan
            </span>
            
            {status === 'error' && (
              <span className="comment-status error">⚠️ Gagal menyimpan</span>
            )}

            <button 
              className="btn btn-ghost btn-sm" 
              onClick={handleCancel}
              disabled={status === 'saving'}
            >
              Batal
            </button>
            <button 
              className="btn btn-primary btn-sm" 
              onClick={handleSave}
              disabled={status === 'saving'}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {status === 'saving' ? (
                <><Loader2 size={14} className="spinner" /> Menyimpan...</>
              ) : (
                <><Check size={14} /> Simpan</>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="comment-section">
      <div 
        className="comment-box-view"
        onClick={() => setIsEditing(true)}
      >
        <div className="comment-header">
          <MessageSquare size={14} />
          <span>Komentar & Catatan</span>
          {status === 'saved' && (
            <span className="comment-status saved" style={{ marginLeft: 'auto' }}>
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
          <div className="comment-text">{text}</div>
        ) : (
          <div className="comment-placeholder">
            Belum ada komentar. Klik di sini untuk menambahkan catatan...
          </div>
        )}
      </div>
    </div>
  );
}
