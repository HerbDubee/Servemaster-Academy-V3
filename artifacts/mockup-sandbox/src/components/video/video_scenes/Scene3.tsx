import { useState, useEffect } from 'react';
import './scenes.css';

const messages = [
  { delay: 500,  side: 'left',  label: 'GUEST (Angry)',    bg: '#0A4D68', text: '"I had a reservation at 7. I\'m 20 minutes late, fine — but I expect my table to still be there."' },
  { delay: 2500, side: 'right', label: 'YOU (Server)',     bg: '#FF5E3A', text: '"I completely understand your frustration. Let me check what we can do for you right now."' },
  { delay: 4500, side: 'left',  label: 'GUEST (Firm)',     bg: '#0A4D68', text: '"I specifically booked that corner table. This is unacceptable."' },
  { delay: 6500, side: 'right', label: 'YOU (Server)',     bg: '#FF5E3A', text: '"I have a wonderful table available right now — just as comfortable. I\'ll ensure you receive complimentary drinks as well."' },
  { delay: 8500, side: 'left',  label: 'GUEST (Softening)',bg: 'rgba(10,77,104,0.8)', text: '"...Fine. I suppose that works."' },
];

export function Scene3() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const timers = messages.map((m, i) => setTimeout(() => setCount(i + 1), m.delay));
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <div className="scene scene-fade-in-scale" style={{ flexDirection: 'column', paddingTop: '2.5rem' }}>
      {/* Live badge */}
      <div style={{ position: 'absolute', top: 32, left: 32, display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)', padding: '8px 16px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.1)', zIndex: 20 }}>
        <div className="anim-blink" style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444' }} />
        <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.875rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Live AI Role-Play</span>
      </div>

      <div style={{ width: '100%', maxWidth: '64rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '0 2rem', position: 'relative', zIndex: 10, marginTop: 48 }}>
        {messages.slice(0, count).map((m, i) => (
          <div key={i} className={m.side === 'right' ? 'anim-slide-right' : 'anim-slide-left'} style={{ alignSelf: m.side === 'right' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: 4, color: m.bg, textAlign: m.side === 'right' ? 'right' : 'left', marginLeft: m.side === 'left' ? 8 : 0, marginRight: m.side === 'right' ? 8 : 0 }}>{m.label}</div>
            <div style={{ background: m.bg, color: 'white', padding: '1.25rem', borderRadius: '1rem', borderTopLeftRadius: m.side === 'left' ? 4 : '1rem', borderTopRightRadius: m.side === 'right' ? 4 : '1rem', fontSize: '1.25rem', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)' }}>
              {m.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
