import { useState, useEffect } from 'react';
import './scenes.css';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 600),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <div className="scene scene-fade-in">
      <div className="scene-center">
        {phase >= 1 && (
          <div className="anim-spring-up" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', justifyContent: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 8, background: '#FF5E3A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 24, height: 24, border: '2px solid white', borderRadius: 4 }} />
            </div>
            <h1 style={{ fontSize: '3rem', fontWeight: 900, color: 'white', letterSpacing: '-0.02em', margin: 0 }}>
              ServeMaster <span className="text-orange">Academy</span>
            </h1>
          </div>
        )}
        {phase >= 2 && (
          <div className="anim-slide-up" style={{ overflow: 'hidden' }}>
            <p style={{ fontSize: '1.25rem', color: 'rgba(255,255,255,0.8)', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', margin: 0 }}>
              AI Role-Play Training
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
