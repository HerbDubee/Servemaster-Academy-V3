import { useState, useEffect } from 'react';
import './scenes.css';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 2500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <div className="scene scene-fade-in" style={{ background: 'rgba(17,19,21,0.8)', backdropFilter: 'blur(4px)', flexDirection: 'column' }}>
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        {phase >= 1 && (
          <div className="anim-spring-up" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: '#FF5E3A', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 30px rgba(255,94,58,0.4)' }}>
              <div style={{ width: 32, height: 32, border: '4px solid white', borderRadius: 8 }} />
            </div>
            <h1 style={{ fontSize: '3.75rem', fontWeight: 900, color: 'white', letterSpacing: '-0.02em', margin: 0 }}>
              ServeMaster <span className="text-orange">Academy</span>
            </h1>
          </div>
        )}
        {phase >= 2 && (
          <div className="anim-slide-up" style={{ marginTop: '1.5rem', overflow: 'hidden' }}>
            <h3 style={{ fontSize: '1.5rem', color: 'rgba(255,255,255,0.8)', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', margin: 0 }}>
              Master Every Interaction
            </h3>
          </div>
        )}
      </div>
      {phase >= 3 && (
        <div className="anim-fade-in" style={{ position: 'absolute', bottom: 48 }}>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '1.125rem', letterSpacing: '0.15em', fontWeight: 500, margin: 0 }}>servemasteracademy.ca</p>
        </div>
      )}
    </div>
  );
}
