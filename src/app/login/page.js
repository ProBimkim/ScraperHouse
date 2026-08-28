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
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6' }}>
      <div style={{ backgroundColor: 'white', padding: '2.5rem', borderRadius: '0.5rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)', width: '100%', maxWidth: '400px', margin: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem', textAlign: 'center', color: '#111827' }}>
          Autentikasi Scraper
        </h1>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label htmlFor="keyword" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
              Kata Kunci (Password)
            </label>
            <input 
              type="password" 
              id="keyword" 
              name="keyword" 
              required 
              style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', boxSizing: 'border-box', outline: 'none' }}
              placeholder="Masukkan kata kunci..."
            />
          </div>
          
          {error && (
            <div style={{ color: '#dc2626', fontSize: '0.875rem', backgroundColor: '#fee2e2', padding: '0.75rem', borderRadius: '0.375rem' }}>
              {error}
            </div>
          )}
          
          <button 
            type="submit" 
            disabled={loading}
            style={{ 
              marginTop: '0.5rem',
              width: '100%', 
              backgroundColor: loading ? '#9ca3af' : '#2563eb', 
              color: 'white', 
              padding: '0.75rem', 
              borderRadius: '0.375rem', 
              border: 'none',
              fontWeight: '500',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s',
              fontSize: '1rem'
            }}
          >
            {loading ? 'Memverifikasi...' : 'Masuk ke Aplikasi'}
          </button>
        </form>
      </div>
    </div>
  )
}
