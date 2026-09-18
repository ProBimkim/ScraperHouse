'use client';
import { useEffect } from 'react';
import { Trash2, X, ExternalLink, Hash, HelpCircle, Calendar, FileText, AtSign, CheckCircle } from 'lucide-react';

export default function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  isDeleting = false,
  item = null,
}) {
  // Tutup modal ketika tombol Escape ditekan
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isDeleting && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen || !item) return null;

  const isSherlock = !!item.username;
  const questionsCount = item.jumlah_pertanyaan ?? (item.questions ? item.questions.length : null);
  const formattedDate = item.createdAt ? new Date(item.createdAt).toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }) : null;

  return (
    <div className="confirm-overlay" onClick={!isDeleting ? onClose : undefined}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Glowing Trash Icon */}
        <div className="confirm-icon-wrapper">
          <Trash2 size={30} />
        </div>

        <h3 className="confirm-title">Konfirmasi Hapus Data</h3>
        <p className="confirm-desc">
          Apakah Anda yakin ingin menghapus data ini? Tindakan ini bersifat permanen.
        </p>

        {/* Info Box yang ingin dihapus */}
        <div className="confirm-info-box">
          {isSherlock ? (
            <>
              <div className="confirm-info-row">
                <span className="confirm-info-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AtSign size={14} /> Username
                </span>
                <span className="confirm-info-value" style={{ color: '#34d399', fontWeight: 700 }}>
                  @{item.username}
                </span>
              </div>

              <div className="confirm-info-row">
                <span className="confirm-info-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle size={14} /> Ditemukan
                </span>
                <span className="confirm-info-value">
                  {item.foundCount ?? 0} dari {item.totalSites ?? 0} situs
                </span>
              </div>
            </>
          ) : (
            <div className="confirm-info-row">
              <span className="confirm-info-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileText size={14} /> Judul Form
              </span>
              <span className="confirm-info-value" style={{ color: '#60a5fa' }}>
                {item.title || 'Untitled Form'}
              </span>
            </div>
          )}

          {item.slug && (
            <div className="confirm-info-row">
              <span className="confirm-info-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Hash size={14} /> Slug / ID
              </span>
              <span className="confirm-info-value" style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>
                {item.slug}
              </span>
            </div>
          )}

          {!isSherlock && questionsCount !== null && (
            <div className="confirm-info-row">
              <span className="confirm-info-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <HelpCircle size={14} /> Total Soal
              </span>
              <span className="confirm-info-value">
                {questionsCount} pertanyaan
              </span>
            </div>
          )}

          {formattedDate && (
            <div className="confirm-info-row">
              <span className="confirm-info-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Calendar size={14} /> Dibuat Pada
              </span>
              <span className="confirm-info-value" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {formattedDate}
              </span>
            </div>
          )}

          {item.url && (
            <div className="confirm-info-row" style={{ alignItems: 'flex-start' }}>
              <span className="confirm-info-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ExternalLink size={14} /> URL
              </span>
              <span 
                className="confirm-info-value" 
                style={{ 
                  fontSize: '0.78rem', 
                  maxWidth: '260px', 
                  whiteSpace: 'nowrap', 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis',
                  color: 'var(--text-muted)'
                }}
                title={item.url}
              >
                {item.url}
              </span>
            </div>
          )}
        </div>

        {/* Warning Note */}
        <div className="confirm-warning-note">
          {isSherlock
            ? '⚠️ Seluruh data hasil pencarian username ini akan dihapus permanen dari sistem.'
            : '⚠️ Seluruh data pertanyaan, pilihan jawaban, dan file media terkait hasil scraping ini akan dihapus permanen dari sistem.'}
        </div>

        {/* Liquid Capsule Buttons */}
        <div className="confirm-actions">
          <button
            type="button"
            className="btn-liquid-cancel"
            onClick={onClose}
            disabled={isDeleting}
          >
            <X size={16} />
            Batal
          </button>
          <button
            type="button"
            className="btn-liquid-delete"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            <Trash2 size={16} />
            {isDeleting ? 'Menghapus...' : 'Konfirmasi Hapus'}
          </button>
        </div>
      </div>
    </div>
  );
}
