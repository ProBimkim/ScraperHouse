# Panduan Membuat Desain "Liquid Capsule Button"

Desain *liquid capsule* (atau *glassmorphism 3D pill*) adalah gaya desain modern futuristik yang mengandalkan kombinasi transparansi, pembiasan (*blur*), dan bayangan (*shadow*) berlapis untuk menciptakan ilusi kaca tebal atau cairan yang solid.

Berikut adalah panduan lengkap (*skills*) dan prinsip CSS untuk membuat desain *Liquid Capsule Button*.

## 1. Bentuk Dasar (The Capsule)
Tombol harus selalu memiliki bentuk bulat penuh (seperti pil) di ujungnya.
- **`border-radius: 999px;`** : Rahasia utama untuk memastikan ujung tombol selalu melingkar sempurna, terlepas dari seberapa panjang atau lebar tombol tersebut.
- **`padding`** yang proporsional (misalnya `14px 24px`) untuk menjaga keseimbangan visual.

## 2. Material Kaca (Glass Base)
Efek kaca didapatkan dari transparansi *background* dan *backdrop-filter*.
- **`background: rgba(255, 255, 255, 0.05);`** : Jangan gunakan warna solid. Gunakan warna putih atau warna tema (seperti biru/hijau) dengan transparansi (alpha) sangat rendah (sekitar 5% - 15%).
- **`backdrop-filter: blur(10px);`** : (Opsional) memberikan efek buram pada objek di belakang tombol.
- **`border: 1px solid rgba(255, 255, 255, 0.1);`** : Garis batas transparan tipis untuk mempertegas pinggiran kaca.

## 3. Efek Dimensi 3D & Liquid (Layered Shadows)
Ini adalah inti dari efek cairan (*liquid*) atau ketebalan kaca. Kita menggunakan minimal 3 lapis bayangan (`box-shadow`).
```css
box-shadow: 
  inset 0 3px 5px rgba(255, 255, 255, 0.2), /* 1. Cahaya (Highlight) pantulan dari atas */
  inset 0 -3px 8px rgba(0, 0, 0, 0.6),      /* 2. Bayangan gelap cembung dari bawah */
  0 8px 20px rgba(0, 0, 0, 0.4);            /* 3. Drop shadow luar (agar tombol melayang) */
```

## 4. Efek Interaksi (Hover & Glow)
Tombol *liquid* harus terasa "hidup". Saat kursor menyorot (*hover*), tombol harus terlihat sedikit terangkat dan memancarkan cahaya pendaran (*glow*).
```css
.btn-liquid:hover {
  transform: translateY(-2px); /* Tombol sedikit terangkat naik */
  background: rgba(59, 130, 246, 0.25); /* Transparansi background sedikit ditingkatkan */
  box-shadow: 
    inset 0 3px 6px rgba(255, 255, 255, 0.3),  /* Highlight atas lebih terang */
    inset 0 -3px 10px rgba(59, 130, 246, 0.8), /* Bayangan bawah memancarkan warna neon dalam */
    0 10px 30px rgba(59, 130, 246, 0.6);       /* Pendaran glow neon menyebar ke luar */
}
```

## 5. Kode Lengkap (Template CSS)

Berikut adalah *snippet* lengkap CSS siap pakai (berwarna biru sebagai *Primary Color*):

```css
.btn-liquid {
  /* Layout & Tipografi */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 24px;
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  font-size: 0.95rem;
  letter-spacing: 0.025em;
  color: #ffffff;
  
  /* Bentuk & Transisi */
  border: none;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
  
  /* Material Kaca & Dimensi */
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.3);
  box-shadow: 
    inset 0 3px 5px rgba(255, 255, 255, 0.2),
    inset 0 -3px 8px rgba(59, 130, 246, 0.6),
    0 5px 20px rgba(59, 130, 246, 0.4);
}

.btn-liquid:hover:not(:disabled) {
  transform: translateY(-2px);
  background: rgba(59, 130, 246, 0.25);
  box-shadow: 
    inset 0 3px 6px rgba(255, 255, 255, 0.3),
    inset 0 -3px 10px rgba(59, 130, 246, 0.8),
    0 10px 30px rgba(59, 130, 246, 0.6);
}

.btn-liquid:active:not(:disabled) {
  transform: translateY(1px);
}
```
