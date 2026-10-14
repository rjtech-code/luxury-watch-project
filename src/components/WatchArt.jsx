import { useId } from 'react';

/**
 * Line-art watch illustrations used when a product has no photograph yet.
 * They are drawings of a *type* of watch (dive, chronograph, dress…), not renders of a specific model,
 * and are labelled as illustrations wherever a customer could mistake them for product photography.
 */
const GOLD = 'var(--color-champagne)';
const DEEP = 'var(--color-bronze)';

const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const CX = 160; const CY = 200;
const pol = (r, deg) => { const a = (deg * Math.PI) / 180; return [CX + r * Math.sin(a), CY - r * Math.cos(a)]; };
const f = (n) => n.toFixed(2);

export function artKind(p = {}) {
  const t = `${p.typeLabel ?? ''} ${p.collectionName ?? ''}`.toLowerCase();
  if (p.isSmartwatch || /smart|sensor/.test(t)) return 'smart';
  if (/digital|rugged/.test(t)) return 'digital';
  if (/dive/.test(t)) return 'dive';
  if (/chrono/.test(t)) return 'chrono';
  if (/pilot/.test(t)) return 'pilot';
  if (/travel|dual time/.test(t)) return 'travel';
  if (/complicat/.test(t)) return 'complication';
  if (/jewel/.test(t)) return 'jewel';
  if (/dress/.test(t)) return 'dress';
  if (/sport|integrated/.test(t)) return 'sport';
  return 'classic';
}

const Ticks = ({ n, r1, r2, w = 1, every, r3, op = 0.9 }) => (
  <g stroke={GOLD} strokeWidth={w} strokeLinecap="round" opacity={op}>
    {Array.from({ length: n }, (_, i) => {
      const d = (360 / n) * i; const long = every && i % every === 0;
      const [x1, y1] = pol(long && r3 ? r3 : r1, d); const [x2, y2] = pol(r2, d);
      return <line key={i} x1={f(x1)} y1={f(y1)} x2={f(x2)} y2={f(y2)} strokeWidth={long ? w * 1.7 : w} />;
    })}
  </g>
);

const Baton = ({ r1 = 52, r2 = 64, w = 3.2, count = 12, skip = [] }) => (
  <g stroke={GOLD} strokeLinecap="butt">
    {Array.from({ length: count }, (_, i) => {
      if (skip.includes(i)) return null;
      const d = (360 / count) * i; const [x1, y1] = pol(r1, d); const [x2, y2] = pol(r2, d);
      return <line key={i} x1={f(x1)} y1={f(y1)} x2={f(x2)} y2={f(y2)} strokeWidth={i % 3 === 0 ? w * 1.5 : w} />;
    })}
  </g>
);

/** A hand drawn as a pointed polygon from the centre, rotated to `angle` degrees clockwise from 12. */
const Hand = ({ angle, len, w = 4, tail = 12, kind = 'sword' }) => {
  const pts = kind === 'dauphine'
    ? `0,${-len} ${w},${-len * 0.18} 0,${tail} ${-w},${-len * 0.18}`
    : kind === 'cathedral'
      ? `0,${-len} ${w * 0.55},${-len * 0.74} 0,${-len * 0.6} ${-w * 0.55},${-len * 0.74}`
      : `0,${-len} ${w * 0.5},${-len * 0.82} ${w * 0.5},${tail} ${-w * 0.5},${tail} ${-w * 0.5},${-len * 0.82}`;
  return (
    <g transform={`translate(${CX} ${CY}) rotate(${angle})`}>
      <polygon points={pts} fill={GOLD} stroke="var(--color-ink)" strokeWidth=".6" />
      {kind === 'sword' && <polygon points={`0,${-len * 0.72} ${w * 0.18},${-len * 0.4} ${-w * 0.18},${-len * 0.4}`} fill="var(--color-ink)" opacity=".55" />}
    </g>
  );
};
const Hands = ({ kind = 'sword', hl = 36, ml = 54, sec = true, secAngle = 168 }) => (
  <g>
    <Hand angle={305} len={hl} w={kind === 'dauphine' ? 4.2 : 5.2} kind={kind} />
    <Hand angle={62} len={ml} w={kind === 'dauphine' ? 3.2 : 4} kind={kind} />
    {sec && (
      <g transform={`translate(${CX} ${CY}) rotate(${secAngle})`} stroke={GOLD} strokeWidth="1.1" strokeLinecap="round">
        <line x1="0" y1="14" x2="0" y2={-ml - 4} />
        <circle cx="0" cy={-ml} r="1.6" fill={GOLD} stroke="none" transform={`translate(0 ${4})`} />
      </g>
    )}
    <circle cx={CX} cy={CY} r="4.2" fill={GOLD} stroke="var(--color-ink)" strokeWidth="1" />
  </g>
);

function Bracelet({ w = 54, top = true, bottom = true, from = 118, gap = 15 }) {
  const rows = [];
  for (let k = 0; k < 6; k++) {
    const tw = w - k * 1.4;
    if (top) rows.push(<rect key={`t${k}`} x={CX - tw / 2} y={from - 14 - (k + 1) * gap} width={tw} height={gap - 2.5} rx="2" />);
    if (bottom) rows.push(<rect key={`b${k}`} x={CX - tw / 2} y={400 - from + 2 + k * gap} width={tw} height={gap - 2.5} rx="2" />);
  }
  return <g fill="none" stroke={GOLD} strokeWidth="1.2" opacity=".78">{rows}</g>;
}

function Leather({ w = 52 }) {
  return (
    <g fill="none" stroke={GOLD} strokeWidth="1.2" opacity=".78">
      <path d={`M${CX - w / 2 + 3} 126 L${CX - w / 2 - 2} -6 H${CX + w / 2 + 2} L${CX + w / 2 - 3} 126`} />
      <path d={`M${CX - w / 2 + 3} 274 L${CX - w / 2 - 2} 406 H${CX + w / 2 + 2} L${CX + w / 2 - 3} 274`} />
      <g strokeDasharray="3 4" opacity=".7" strokeWidth="1">
        <path d={`M${CX - w / 2 + 8} 124 L${CX - w / 2 + 3} -2`} /><path d={`M${CX + w / 2 - 8} 124 L${CX + w / 2 - 3} -2`} />
        <path d={`M${CX - w / 2 + 8} 276 L${CX - w / 2 + 3} 402`} /><path d={`M${CX + w / 2 - 8} 276 L${CX + w / 2 - 3} 402`} />
      </g>
    </g>
  );
}

function Rubber({ w = 50 }) {
  return (
    <g fill="none" stroke={GOLD} strokeWidth="1.2" opacity=".78">
      <path d={`M${CX - w / 2} 120 Q${CX - w / 2 - 6} 50 ${CX - w / 2 - 2} -6 H${CX + w / 2 + 2} Q${CX + w / 2 + 6} 50 ${CX + w / 2} 120`} />
      <path d={`M${CX - w / 2} 280 Q${CX - w / 2 - 6} 350 ${CX - w / 2 - 2} 406 H${CX + w / 2 + 2} Q${CX + w / 2 + 6} 350 ${CX + w / 2} 280`} />
      {[0, 1, 2, 3, 4].map((i) => <circle key={i} cx={CX} cy={312 + i * 17} r="2.4" />)}
    </g>
  );
}

function Lugs({ r = 90, w = 56 }) {
  const y = Math.sqrt(Math.max(0, r * r - (w / 2) ** 2));
  return (
    <g fill="none" stroke={GOLD} strokeWidth="1.6">
      <path d={`M${CX - w / 2} ${CY - y + 4} L${CX - w / 2 - 6} ${CY - y - 16} H${CX - w / 2 + 6}`} />
      <path d={`M${CX + w / 2} ${CY - y + 4} L${CX + w / 2 + 6} ${CY - y - 16} H${CX + w / 2 - 6}`} />
      <path d={`M${CX - w / 2} ${CY + y - 4} L${CX - w / 2 - 6} ${CY + y + 16} H${CX - w / 2 + 6}`} />
      <path d={`M${CX + w / 2} ${CY + y - 4} L${CX + w / 2 + 6} ${CY + y + 16} H${CX + w / 2 - 6}`} />
    </g>
  );
}

const Crown = ({ r, y = CY }) => (
  <g fill="none" stroke={GOLD} strokeWidth="1.6">
    <rect x={CX + r - 1} y={y - 8} width="11" height="16" rx="2" />
    <path d={`M${CX + r + 3} ${y - 6}v12M${CX + r + 6.5} ${y - 6}v12`} strokeWidth=".9" opacity=".7" />
  </g>
);

export function WatchArt({ product, kind: kindProp, seed, className, label }) {
  const uid = useId().replace(/:/g, '');
  const kind = kindProp ?? artKind(product);
  const round = !['smart', 'digital', 'jewel'].includes(kind);

  const dialFill = `url(#dial-${uid})`;
  return (
    <svg viewBox="0 0 320 400" className={className} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id={`glow-${uid}`} cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#d2b57b" stopOpacity=".16" /><stop offset="100%" stopColor="#d2b57b" stopOpacity="0" /></radialGradient>
        <radialGradient id={`dial-${uid}`} cx="40%" cy="32%" r="80%"><stop offset="0%" stopColor="#2a2520" /><stop offset="100%" stopColor="#100e0c" /></radialGradient>
        <clipPath id={`clip-${uid}`}><circle cx={CX} cy={CY} r="70" /></clipPath>
      </defs>
      <circle cx={CX} cy={CY} r="168" fill={`url(#glow-${uid})`} />

      {/* strap */}
      {['dress', 'pilot', 'jewel'].includes(kind) && <Leather />}
      {['dive', 'chrono', 'travel', 'classic', 'complication'].includes(kind) && <Bracelet from={CY - 82} />}
      {kind === 'sport' && <Bracelet from={CY - 80} w={62} gap={17} />}
      {['smart', 'digital'].includes(kind) && <Rubber />}

      {/* case + dial */}
      {round && kind !== 'sport' && <Lugs r={kind === 'dress' ? 84 : 90} />}
      {round && kind !== 'sport' && <circle cx={CX} cy={CY} r={kind === 'dress' ? 84 : 90} fill="var(--color-ink)" stroke={GOLD} strokeWidth="2" />}
      {kind === 'sport' && <polygon points={Array.from({ length: 8 }, (_, i) => pol(92, 22.5 + i * 45).map(f).join(',')).join(' ')} fill="var(--color-ink)" stroke={GOLD} strokeWidth="2" />}
      {kind === 'sport' && Array.from({ length: 8 }, (_, i) => { const [x, y] = pol(83, 22.5 + i * 45); return <circle key={i} cx={x} cy={y} r="2.3" fill={GOLD} opacity=".85" />; })}
      {round && <Crown r={kind === 'dress' ? 84 : kind === 'sport' ? 92 : 90} />}
      {round && <circle cx={CX} cy={CY} r={kind === 'dress' ? 76 : 71} fill={dialFill} stroke={DEEP} strokeWidth="1" />}

      {kind === 'dive' && (<>
        <circle cx={CX} cy={CY} r="82" fill="none" stroke={GOLD} strokeWidth="1" opacity=".6" />
        <Ticks n={60} r1={77} r2={87} w={1} every={5} r3={74} />
        <polygon points={`${CX},${CY - 87} ${CX - 4},${CY - 78} ${CX + 4},${CY - 78}`} fill={GOLD} />
        <g fill={GOLD}>{[1, 2, 4, 5, 7, 8, 10, 11].map((i) => { const [x, y] = pol(55, i * 30); return <circle key={i} cx={f(x)} cy={f(y)} r="4" />; })}</g>
        <Baton r1={48} r2={62} w={4} skip={[1, 2, 4, 5, 7, 8, 10, 11]} />
        <Hands kind="sword" hl={34} ml={52} />
      </>)}

      {kind === 'chrono' && (<>
        <Ticks n={60} r1={64} r2={69} w={.8} every={5} r3={62} />
        <Baton r1={57} r2={63} w={2.2} />
        {[[CX - 30, CY], [CX + 30, CY], [CX, CY + 32]].map(([x, y], i) => (<g key={i}><circle cx={x} cy={y} r="16" fill="none" stroke={GOLD} strokeWidth="1" /><g transform={`translate(${x - CX} ${y - CY})`}><Ticks n={12} r1={12} r2={15} w={.8} /></g><line x1={x} y1={y} x2={x + (i === 1 ? 8 : -6)} y2={y - 10} stroke={GOLD} strokeWidth="1.2" /></g>))}
        <rect x={CX + 88} y={CY - 38} width="9" height="14" rx="2" fill="none" stroke={GOLD} strokeWidth="1.5" />
        <rect x={CX + 88} y={CY + 24} width="9" height="14" rx="2" fill="none" stroke={GOLD} strokeWidth="1.5" />
        <Hand angle={305} len={32} w={4.6} kind="sword" /><Hand angle={62} len={50} w={3.6} kind="sword" />
        <circle cx={CX} cy={CY} r="3.6" fill={GOLD} stroke="var(--color-ink)" />
      </>)}

      {kind === 'dress' && (<>
        <Baton r1={58} r2={68} w={1.8} />
        <circle cx={CX} cy={CY + 36} r="0" />
        <g fill="none" stroke={GOLD} strokeWidth=".8" opacity=".6"><circle cx={CX} cy={CY} r="73" /></g>
        <Hands kind="dauphine" hl={38} ml={58} sec={false} />
      </>)}

      {kind === 'pilot' && (<>
        {[[0, '12'], [90, '3'], [180, '6'], [270, '9']].map(([d, t]) => { const [x, y] = pol(54, d); return <text key={t} x={f(x)} y={f(y + 7)} textAnchor="middle" fontSize="20" fontWeight="700" fill={GOLD} style={{ fontFamily: 'var(--font-sans)' }}>{t}</text>; })}
        <Ticks n={60} r1={63} r2={68} w={1} every={5} r3={60} />
        <polygon points={`${CX},${CY - 66} ${CX - 4},${CY - 59} ${CX + 4},${CY - 59}`} fill={GOLD} />
        <Hands kind="cathedral" hl={36} ml={56} />
      </>)}

      {kind === 'travel' && (<>
        <circle cx={CX} cy={CY} r="82" fill="none" stroke={GOLD} strokeWidth="1" opacity=".6" />
        <Ticks n={24} r1={76} r2={86} w={1.4} every={6} r3={74} />
        <Ticks n={60} r1={64} r2={68} w={.8} every={5} r3={62} />
        <Baton r1={50} r2={60} w={3} />
        <g transform={`translate(${CX} ${CY}) rotate(48)`}><line x1="0" y1="8" x2="0" y2="-56" stroke={GOLD} strokeWidth="1.4" /><polygon points="0,-62 4,-52 -4,-52" fill={GOLD} /></g>
        <Hands kind="sword" hl={34} ml={52} />
      </>)}

      {kind === 'complication' && (<>
        <Ticks n={60} r1={64} r2={69} w={.8} every={5} r3={62} />
        <Baton r1={55} r2={63} w={2.2} skip={[6]} />
        <rect x={CX - 38} y={CY - 38} width="22" height="16" fill="none" stroke={GOLD} strokeWidth="1" /><rect x={CX + 16} y={CY - 38} width="22" height="16" fill="none" stroke={GOLD} strokeWidth="1" />
        <path d={`M${CX - 24} ${CY + 34} a24 24 0 0 1 48 0 z`} fill="none" stroke={GOLD} strokeWidth="1.2" />
        <circle cx={CX + 4} cy={CY + 24} r="5.5" fill={GOLD} /><circle cx={CX - 8} cy={CY + 20} r="1" fill={GOLD} /><circle cx={CX + 14} cy={CY + 29} r="1" fill={GOLD} />
        <Hands kind="dauphine" hl={36} ml={54} sec={false} />
      </>)}

      {kind === 'sport' && (<>
        <circle cx={CX} cy={CY} r="71" fill={dialFill} stroke={DEEP} strokeWidth="1" />
        <g clipPath={`url(#clip-${uid})`} stroke={GOLD} strokeWidth=".6" opacity=".38">{Array.from({ length: 20 }, (_, i) => <line key={i} x1={CX - 72} x2={CX + 72} y1={CY - 70 + i * 7.4} y2={CY - 70 + i * 7.4} />)}</g>
        <Baton r1={50} r2={62} w={4.2} />
        <rect x={CX + 32} y={CY - 7} width="14" height="14" fill="none" stroke={GOLD} strokeWidth="1" />
        <Hands kind="sword" hl={33} ml={50} sec={false} />
      </>)}

      {kind === 'classic' && (<>
        <Ticks n={60} r1={63} r2={68} w={.8} every={5} r3={61} />
        <Baton r1={50} r2={60} w={3} />
        <Hands kind="dauphine" hl={36} ml={54} />
      </>)}

      {kind === 'jewel' && (<>
        <rect x={CX - 52} y={CY - 70} width="104" height="140" rx="8" fill="var(--color-ink)" stroke={GOLD} strokeWidth="2" />
        {Array.from({ length: 22 }, (_, i) => { const t = i / 22; const per = 2 * (96 + 132); const d = t * per; let x; let y; if (d < 96) { x = CX - 48 + d; y = CY - 66; } else if (d < 228) { x = CX + 48; y = CY - 66 + (d - 96); } else if (d < 324) { x = CX + 48 - (d - 228); y = CY + 66; } else { x = CX - 48; y = CY + 66 - (d - 324); } return <circle key={i} cx={f(x)} cy={f(y)} r="1.8" fill={GOLD} />; })}
        <rect x={CX - 40} y={CY - 58} width="80" height="116" rx="3" fill={dialFill} stroke={DEEP} />
        <text x={CX} y={CY - 38} textAnchor="middle" fontSize="11" fill={GOLD} style={{ fontFamily: 'var(--font-display)' }}>XII</text>
        <text x={CX} y={CY + 50} textAnchor="middle" fontSize="11" fill={GOLD} style={{ fontFamily: 'var(--font-display)' }}>VI</text>
        <Hands kind="dauphine" hl={30} ml={44} sec={false} />
        <Crown r={52} />
      </>)}

      {kind === 'smart' && (<>
        <rect x={CX - 62} y={CY - 76} width="124" height="152" rx="36" fill="var(--color-ink)" stroke={GOLD} strokeWidth="2" />
        <rect x={CX - 53} y={CY - 67} width="106" height="134" rx="29" fill="#050505" stroke={DEEP} />
        <g fill="none" strokeLinecap="round" strokeWidth="4.5">
          <circle cx={CX} cy={CY - 6} r="34" stroke={GOLD} opacity=".25" /><path d={`M${CX} ${CY - 40} A34 34 0 1 1 ${CX - 30} ${CY + 10}`} stroke={GOLD} />
          <circle cx={CX} cy={CY - 6} r="25" stroke={GOLD} opacity=".25" /><path d={`M${CX} ${CY - 31} A25 25 0 0 1 ${CX + 24} ${CY + 2}`} stroke="#fff" opacity=".85" />
        </g>
        <text x={CX} y={CY} textAnchor="middle" fontSize="19" fill="#fff" style={{ fontFamily: 'var(--font-display)' }}>10:09</text>
        <rect x={CX + 62} y={CY - 24} width="9" height="22" rx="3" fill="none" stroke={GOLD} strokeWidth="1.6" /><rect x={CX + 62} y={CY + 8} width="6" height="14" rx="2" fill="none" stroke={GOLD} strokeWidth="1.4" />
      </>)}

      {kind === 'digital' && (<>
        <rect x={CX - 70} y={CY - 70} width="140" height="140" rx="18" fill="var(--color-ink)" stroke={GOLD} strokeWidth="2.4" />
        <rect x={CX - 56} y={CY - 56} width="112" height="112" rx="10" fill="none" stroke={DEEP} />
        <rect x={CX - 44} y={CY - 24} width="88" height="48" rx="3" fill="#0c0c0b" stroke={GOLD} strokeWidth="1" />
        <text x={CX} y={CY + 14} textAnchor="middle" fontSize="34" fontWeight="700" fill={GOLD} style={{ fontFamily: 'var(--font-sans)', fontVariantNumeric: 'tabular-nums' }}>10:09</text>
        <text x={CX - 36} y={CY - 32} fontSize="8" fill={GOLD} style={{ fontFamily: 'var(--font-sans)' }}>MON 12</text>
        {[-1, 1].map((s) => [-30, 30].map((dy) => <rect key={`${s}${dy}`} x={s > 0 ? CX + 70 : CX - 78} y={CY + dy - 7} width="8" height="14" rx="2" fill="none" stroke={GOLD} strokeWidth="1.5" />))}
      </>)}
    </svg>
  );
}
