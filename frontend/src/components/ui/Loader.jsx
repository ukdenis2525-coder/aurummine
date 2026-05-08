import React from 'react';

export default function Loader() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', background: '#0F0F0F', gap: 16
    }}>
      <div style={{
        width: 60, height: 60, borderRadius: '50%',
        background: 'linear-gradient(135deg, #B8860B, #D4AF37, #F5D76E)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28, animation: 'pulse 1.5s ease-in-out infinite'
      }}>⚡</div>
      <span style={{ color: '#D4AF37', fontSize: 18, fontWeight: 700, letterSpacing: 2 }}>
        AURUMMINE
      </span>
      <style>{`@keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.1)} }`}</style>
    </div>
  );
}
