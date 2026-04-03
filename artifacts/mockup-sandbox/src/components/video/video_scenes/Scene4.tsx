import { useState, useEffect } from 'react';
import './scenes.css';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <div className="scene scene-fade-in">
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }}>

        {/* Scenario complete card */}
        <div className="anim-slide-down" style={{
          position: 'relative',
          background: 'rgba(26,29,32,0.9)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)',
          padding: '2rem',
          borderRadius: '1rem',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
          minWidth: 500,
          textAlign: 'center',
          overflow: 'visible',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: '#22c55e', borderRadius: '4px 4px 0 0' }} />
          <h2 style={{ fontSize: '1.875rem', fontWeight: 900, color: 'white', marginBottom: 8 }}>Scenario Complete</h2>
          <p style={{ color: 'rgba(255,255,255,0.6)' }}>The Difficult Guest</p>

          {phase >= 1 && (
            <div className="anim-pop" style={{
              position: 'absolute', top: -24, right: -24,
              width: 64, height: 64, background: '#22c55e', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '4px solid #1A1D20', boxShadow: '0 10px 30px rgba(34,197,94,0.4)',
            }}>
              <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}
        </div>

        {/* XP badge */}
        {phase >= 2 && (
          <div className="anim-pop-delay" style={{
            display: 'flex', alignItems: 'center', gap: '1rem',
            background: 'linear-gradient(to right, #FF5E3A, #D94E2F)',
            padding: '1rem 2rem', borderRadius: 9999,
            boxShadow: '0 0 40px rgba(255,94,58,0.3)',
          }}>
            <span style={{ color: 'white', fontWeight: 900, fontSize: '1.5rem' }}>+15 XP</span>
            <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.2)' }} />
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '1.125rem', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Excellent Empathy</span>
          </div>
        )}
      </div>
    </div>
  );
}
