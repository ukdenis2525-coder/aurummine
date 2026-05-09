import React from 'react';

export default function Loader() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', background: '#08080C', gap: 20
    }}>
      {/* Glow background */}
      <div style={{
        position: 'absolute', width: 200, height: 200, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(212,175,55,0.12) 0%, transparent 70%)',
        filter: 'blur(40px)'
      }} />

      {/* Animated orb */}
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: 'linear-gradient(135deg, #B8860B, #D4AF37, #F5D76E)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 32, animation: 'pulse 1.5s ease-in-out infinite',
        boxShadow: '0 0 40px rgba(212,175,55,0.3)',
        position: 'relative'
      }}>⚡</div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <span style={{
          color: '#D4AF37', fontSize: 20, fontWeight: 800,
          letterSpacing: 3, fontFamily: "'Inter', sans-serif"
        }}>
          AURUMMINE
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#D4AF37',
              animation: `blink 1.2s ease-in-out ${i * 0.2}s infinite`
            }} />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
      `}</style>
    </div>
  );
}
