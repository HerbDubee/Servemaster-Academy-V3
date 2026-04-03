import { useState, useEffect } from 'react';
import './scenes.css';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 600),
      setTimeout(() => setPhase(3), 1000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <div className="scene scene-fade-in">
      <div style={{ position: 'relative', zIndex: 10 }}>
        {phase >= 1 && (
          <div className="anim-slide-down" style={{
            position: 'relative',
            background: 'rgba(26,29,32,0.9)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '2.5rem',
            borderRadius: '1rem',
            boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
            minWidth: 600,
            textAlign: 'center',
            overflow: 'hidden',
          }}>
            {phase >= 2 && (
              <div className="anim-expand-width" style={{
                position: 'absolute', top: 0, left: 0,
                height: 4, background: '#FF5E3A',
              }} />
            )}
            <p style={{ color: '#FF5E3A', fontWeight: 700, letterSpacing: '0.15em', fontSize: '0.875rem', textTransform: 'uppercase', marginBottom: '1rem' }}>
              Scenario #1
            </p>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 900, color: 'white', marginBottom: '1rem' }}>
              The Difficult Guest
            </h2>
            {phase >= 3 && (
              <p className="anim-fade-in" style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1.125rem' }}>
                Handling the Late Reservation
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
