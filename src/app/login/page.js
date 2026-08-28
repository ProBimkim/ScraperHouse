'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    const formData = new FormData(e.target)
    const keyword = formData.get('keyword')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword })
      })

      if (res.ok) {
        router.push('/')
        router.refresh()
      } else {
        const data = await res.json()
        setError(data.error || 'Kata kunci salah')
      }
    } catch (err) {
      setError('Terjadi kesalahan sistem')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0f19', backgroundImage: 'radial-gradient(circle at 50% 0%, #1e293b 0%, #0b0f19 70%)', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ backgroundColor: 'rgba(30, 41, 59, 0.7)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', padding: '2.5rem', borderRadius: '1rem', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)', width: '100%', maxWidth: '400px', margin: '1rem', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#f8fafc', margin: 0, letterSpacing: '-0.025em' }}>
            Autentikasi Scraper
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.5rem' }}>Silakan masuk untuk melanjutkan</p>
        </div>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label htmlFor="keyword" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#cbd5e1', marginBottom: '0.5rem' }}>
              Kata Kunci (Password)
            </label>
            <input 
              type="password" 
              id="keyword" 
              name="keyword" 
              required 
              style={{ width: '100%', padding: '0.875rem 1rem', backgroundColor: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '0.5rem', boxSizing: 'border-box', outline: 'none', color: '#f8fafc', transition: 'border-color 0.2s, box-shadow 0.2s', fontSize: '1rem' }}
              placeholder="Masukkan kata kunci..."
              onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.2)' }}
              onBlur={(e) => { e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'; e.target.style.boxShadow = 'none' }}
            />
          </div>
          
          {error && (
            <div style={{ color: '#fca5a5', fontSize: '0.875rem', backgroundColor: 'rgba(153, 27, 27, 0.2)', padding: '0.875rem', borderRadius: '0.5rem', border: '1px solid rgba(220, 38, 38, 0.3)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              {error}
            </div>
          )}
          
          <button 
            type="submit" 
            disabled={loading}
            style={{ 
              marginTop: '0.5rem',
              width: '100%', 
              backgroundColor: loading ? '#475569' : '#3b82f6',
              backgroundImage: loading ? 'none' : 'linear-gradient(to right, #3b82f6, #2563eb)',
              color: 'white', 
              padding: '0.875rem', 
              borderRadius: '0.5rem', 
              border: 'none',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              fontSize: '1rem',
              boxShadow: loading ? 'none' : '0 4px 12px rgba(37, 99, 235, 0.3)'
            }}
            onMouseOver={(e) => { if(!loading) e.currentTarget.style.transform = 'translateY(-1px)'; if(!loading) e.currentTarget.style.boxShadow = '0 6px 16px rgba(37, 99, 235, 0.4)' }}
            onMouseOut={(e) => { if(!loading) e.currentTarget.style.transform = 'none'; if(!loading) e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.3)' }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <svg style={{ animation: 'spin 1s linear infinite' }} xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
                Memverifikasi...
                <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
              </span>
            ) : 'Masuk ke Aplikasi'}
          </button>
        </form>
      </div>
    </div>
  )
}
