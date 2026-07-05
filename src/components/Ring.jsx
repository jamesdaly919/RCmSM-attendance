// The attendance ring is drawn as a gear with one "tooth" (segment)
// per required credit — an echo of the Rotary wheel. Fill all four
// segments and the wheel turns gold.

function polar(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx, cy, r, a0, a1) {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

export function SegmentRing({ earned, required, size = 200, stroke = 16, children }) {
  const c = size / 2;
  const r = c - stroke / 2 - 2;
  const gap = 16; // degrees between segments
  const seg = 360 / required - gap;
  const complete = earned >= required;
  const segments = [];
  for (let i = 0; i < required; i++) {
    const a0 = i * (seg + gap) + gap / 2;
    const a1 = a0 + seg;
    const filled = i < Math.min(earned, required);
    segments.push(
      <path
        key={i}
        d={arcPath(c, c, r, a0, a1)}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        className={
          "ring-seg " +
          (filled ? (complete ? "ring-seg--gold" : "ring-seg--azure") : "ring-seg--empty")
        }
        style={{ transitionDelay: `${i * 90}ms` }}
      />
    );
  }
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img"
        aria-label={`${earned} of ${required} attendance credits`}>
        {segments}
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

export function PercentRing({ pct, size = 170, stroke = 14, children }) {
  const c = size / 2;
  const r = c - stroke / 2 - 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img"
        aria-label={`${pct} percent`}>
        <circle cx={c} cy={c} r={r} fill="none" strokeWidth={stroke} className="ring-track" />
        <circle
          cx={c} cy={c} r={r} fill="none" strokeWidth={stroke}
          strokeLinecap="round"
          className={clamped >= 100 ? "ring-arc ring-arc--gold" : "ring-arc"}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - clamped / 100)}
          transform={`rotate(-90 ${c} ${c})`}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}
