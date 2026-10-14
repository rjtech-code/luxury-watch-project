import { useEffect, useId, useRef } from 'react';

/**
 * A dial that keeps real time. Hands sweep in from 12:00 once on load, then follow the visitor's clock.
 * With reduced motion enabled the hands simply tick once per second.
 */
const C = 300;
const pol = (r, deg) => { const a = (deg * Math.PI) / 180; return [C + r * Math.sin(a), C - r * Math.cos(a)]; };
const f = (n) => n.toFixed(2);
const ease = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

export function LiveDial({ name = 'Time Luxe', className }) {
  const uid = useId().replace(/:/g, '');
  const hRef = useRef(null); const mRef = useRef(null); const sRef = useRef(null);
  const dateRef = useRef(null);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0; let timer = 0; const t0 = performance.now();
    const angles = (now) => {
      const ms = now.getMilliseconds(); const s = now.getSeconds() + (reduce ? 0 : ms / 1000);
      const m = now.getMinutes() + s / 60; const h = (now.getHours() % 12) + m / 60;
      return { h: h * 30, m: m * 6, s: s * 6 };
    };
    const apply = (a, k = 1) => {
      hRef.current?.setAttribute('transform', `rotate(${a.h * k} ${C} ${C})`);
      mRef.current?.setAttribute('transform', `rotate(${a.m * k} ${C} ${C})`);
      sRef.current?.setAttribute('transform', `rotate(${a.s * k} ${C} ${C})`);
    };
    const now0 = new Date();
    if (dateRef.current) dateRef.current.textContent = String(now0.getDate());
    if (reduce) {
      const tick = () => { apply(angles(new Date())); timer = window.setTimeout(tick, 1000); };
      tick();
      return () => window.clearTimeout(timer);
    }
    const loop = (t) => {
      const el = (t - t0) / 1900; const k = ease(el);
      apply(angles(new Date()), el < 1 ? k : 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const hours = Array.from({ length: 12 }, (_, i) => i);
  return (
    <svg viewBox="0 0 600 600" className={className} role="img" aria-label="An analogue watch dial showing your current local time">
      <defs>
        <radialGradient id={`face-${uid}`} cx="38%" cy="30%" r="85%"><stop offset="0%" stopColor="#2f2a24" /><stop offset="55%" stopColor="#15120f" /><stop offset="100%" stopColor="#0a0908" /></radialGradient>
        <linearGradient id={`gold-${uid}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#ecd9a8" /><stop offset="50%" stopColor="#c9a965" /><stop offset="100%" stopColor="#8a6a3e" /></linearGradient>
        <radialGradient id={`halo-${uid}`} cx="50%" cy="50%" r="50%"><stop offset="60%" stopColor="#d2b57b" stopOpacity=".0" /><stop offset="100%" stopColor="#d2b57b" stopOpacity=".18" /></radialGradient>
        <pattern id={`guil-${uid}`} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 5h10M5 0v10" stroke="#d2b57b" strokeWidth=".4" opacity=".16" /></pattern>
        <clipPath id={`face-clip-${uid}`}><circle cx={C} cy={C} r="214" /></clipPath>
      </defs>

      <circle cx={C} cy={C} r="296" fill={`url(#halo-${uid})`} />
      {/* bezel and case */}
      <circle cx={C} cy={C} r="262" fill="#0b0a09" stroke={`url(#gold-${uid})`} strokeWidth="6" />
      <circle cx={C} cy={C} r="244" fill="none" stroke={`url(#gold-${uid})`} strokeWidth="1.2" opacity=".7" />
      {Array.from({ length: 120 }, (_, i) => { const [x1, y1] = pol(228, i * 3); const [x2, y2] = pol(i % 10 === 0 ? 216 : 222, i * 3); return <line key={i} x1={f(x1)} y1={f(y1)} x2={f(x2)} y2={f(y2)} stroke="#d2b57b" strokeWidth={i % 10 === 0 ? 1.6 : .7} opacity=".45" />; })}

      {/* dial */}
      <circle cx={C} cy={C} r="214" fill={`url(#face-${uid})`} />
      <circle cx={C} cy={C} r="214" fill={`url(#guil-${uid})`} clipPath={`url(#face-clip-${uid})`} />
      {[190, 150, 110].map((r, i) => <circle key={r} cx={C} cy={C} r={r} fill="none" stroke="#d2b57b" strokeWidth=".5" opacity={0.07 + i * 0.03} />)}

      {/* minute track */}
      {Array.from({ length: 60 }, (_, i) => { if (i % 5 === 0) return null; const [x1, y1] = pol(206, i * 6); const [x2, y2] = pol(197, i * 6); return <line key={i} x1={f(x1)} y1={f(y1)} x2={f(x2)} y2={f(y2)} stroke="#d2b57b" strokeWidth="1.1" opacity=".7" />; })}

      {/* applied hour markers with lume */}
      {hours.map((i) => {
        const d = i * 30; const [x1, y1] = pol(150, d); const [x2, y2] = pol(194, d);
        const [lx, ly] = pol(171, d);
        if (i === 0) return null;
        return (
          <g key={i}>
            <line x1={f(x1)} y1={f(y1)} x2={f(x2)} y2={f(y2)} stroke={`url(#gold-${uid})`} strokeWidth={i % 3 === 0 ? 11 : 7} strokeLinecap="butt" />
            <line x1={f(lx - (x2 - x1) * 0.18)} y1={f(ly - (y2 - y1) * 0.18)} x2={f(lx + (x2 - x1) * 0.18)} y2={f(ly + (y2 - y1) * 0.18)} stroke="#f3ecd9" strokeWidth={i % 3 === 0 ? 4 : 2.4} opacity=".85" />
          </g>
        );
      })}
      <g fill={`url(#gold-${uid})`}>
        <polygon points={`${C - 14},${C - 196} ${C},${C - 150} ${C + 14},${C - 196}`} />
        <polygon points={`${C - 6},${C - 188} ${C},${C - 166} ${C + 6},${C - 188}`} fill="#f3ecd9" opacity=".85" />
      </g>

      {/* wordmark and date */}
      <text x={C} y={C - 92} textAnchor="middle" fontSize="30" fill="#e7d4a2" style={{ fontFamily: 'var(--font-display)', letterSpacing: '.08em' }}>{name}</text>
      <rect x={C + 112} y={C - 20} width="74" height="40" fill="#0a0908" stroke="#d2b57b" strokeWidth="1.4" />
      <text ref={dateRef} x={C + 160} y={C + 9} textAnchor="middle" fontSize="26" fill="#f3ecd9" style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>1</text>

      {/* hands */}
      <g ref={hRef}>
        <polygon points={`${C},${C - 118} ${C + 13},${C - 84} ${C + 7},${C + 26} ${C - 7},${C + 26} ${C - 13},${C - 84}`} fill={`url(#gold-${uid})`} stroke="#0a0908" strokeWidth="1.5" />
        <line x1={C} y1={C - 100} x2={C} y2={C - 56} stroke="#f3ecd9" strokeWidth="5" opacity=".85" />
      </g>
      <g ref={mRef}>
        <polygon points={`${C},${C - 176} ${C + 10},${C - 130} ${C + 6},${C + 30} ${C - 6},${C + 30} ${C - 10},${C - 130}`} fill={`url(#gold-${uid})`} stroke="#0a0908" strokeWidth="1.5" />
        <line x1={C} y1={C - 158} x2={C} y2={C - 92} stroke="#f3ecd9" strokeWidth="4" opacity=".85" />
      </g>
      <g ref={sRef}>
        <line x1={C} y1={C + 52} x2={C} y2={C - 196} stroke="#e7d4a2" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx={C} cy={C + 36} r="9" fill="#e7d4a2" /><circle cx={C} cy={C - 140} r="7" fill="#e7d4a2" stroke="#0a0908" strokeWidth="1.5" />
      </g>
      <circle cx={C} cy={C} r="13" fill={`url(#gold-${uid})`} stroke="#0a0908" strokeWidth="2.5" />
      <circle cx={C} cy={C} r="4" fill="#0a0908" />

      {/* sapphire reflection */}
      <path d={`M ${C - 190} ${C - 70} A 214 214 0 0 1 ${C + 40} ${C - 210} A 260 260 0 0 0 ${C - 190} ${C - 70} Z`} fill="#fff" opacity=".035" />
    </svg>
  );
}
