import { useEffect, useRef, useState } from 'react';

const T = {
  bg: '#0b1220',
  bgCard: '#141f33',
  border: 'rgba(148,163,184,0.10)',
  borderHi: 'rgba(99,102,241,0.25)',
  text: '#f8fafc',
  textSec: '#94a3b8',
  textTer: '#64748b',
  primary: '#6366f1',
  primarySoft: 'rgba(99,102,241,0.14)',
};

const ITEM_H = 36;
const VISIBLE = 3;
const PAD = Math.floor(VISIBLE / 2) * ITEM_H;

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYS_ES = ['L','M','X','J','V','S','D'];

// ── Drum Column ──────────────────────────────────────────────────────────────

function DrumColumn({ items, value, onChange }: { items: string[]; value: string; onChange: (v: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const isProgrammatic = useRef(false);

  useEffect(() => {
    const idx = Math.max(0, items.indexOf(value));
    if (scrollRef.current) {
      isProgrammatic.current = true;
      scrollRef.current.scrollTop = idx * ITEM_H;
      setTimeout(() => { isProgrammatic.current = false; }, 250);
    }
  }, [value, items]);

  const handleScroll = () => {
    if (isProgrammatic.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!scrollRef.current) return;
      const idx = Math.max(0, Math.min(Math.round(scrollRef.current.scrollTop / ITEM_H), items.length - 1));
      isProgrammatic.current = true;
      scrollRef.current.scrollTop = idx * ITEM_H;
      setTimeout(() => { isProgrammatic.current = false; }, 250);
      onChange(items[idx]);
    }, 150);
  };

  return (
    <div style={{ position: 'relative', height: ITEM_H * VISIBLE, width: 44, flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: PAD, left: 0, right: 0, height: ITEM_H, background: T.primarySoft, border: `1px solid ${T.borderHi}`, borderRadius: 8, pointerEvents: 'none', zIndex: 2 }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: PAD, background: `linear-gradient(to bottom, ${T.bgCard} 20%, transparent)`, pointerEvents: 'none', zIndex: 3 }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: PAD, background: `linear-gradient(to top, ${T.bgCard} 20%, transparent)`, pointerEvents: 'none', zIndex: 3 }} />
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ height: '100%', overflowY: 'scroll', scrollbarWidth: 'none', position: 'relative', zIndex: 1 } as React.CSSProperties}
      >
        <div style={{ height: PAD }} />
        {items.map(item => {
          const active = item === value;
          return (
            <div
              key={item}
              onClick={() => {
                const idx = items.indexOf(item);
                if (scrollRef.current) {
                  isProgrammatic.current = true;
                  scrollRef.current.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' });
                  setTimeout(() => { isProgrammatic.current = false; }, 400);
                }
                onChange(item);
              }}
              style={{
                height: ITEM_H,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                fontFamily: "'SF Mono', 'Fira Code', monospace",
                fontWeight: active ? 700 : 400,
                color: active ? T.text : T.textTer,
                cursor: 'pointer',
                transition: 'color 0.15s',
                userSelect: 'none',
              }}
            >
              {item}
            </div>
          );
        })}
        <div style={{ height: PAD }} />
      </div>
    </div>
  );
}

// ── Time Drum Picker ─────────────────────────────────────────────────────────

export function TimeDrumPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const hh = value ? value.split(':')[0] : '09';
  const mm = value ? value.split(':')[1] : '00';

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: '6px 14px' }}>
      <DrumColumn items={HOURS} value={hh} onChange={h => onChange(`${h}:${mm}`)} />
      <span style={{ color: T.textTer, fontSize: 18, fontWeight: 700, fontFamily: 'monospace', userSelect: 'none' }}>:</span>
      <DrumColumn items={MINUTES} value={mm} onChange={m => onChange(`${hh}:${m}`)} />
    </div>
  );
}

// ── Calendar Popup ───────────────────────────────────────────────────────────

function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDayMon(y: number, m: number) { const d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1; }

function CalendarPopup({ value, onChange, onClose }: { value: string; onChange: (v: string) => void; onClose: () => void }) {
  const today = new Date();
  const [vy, setVY] = useState(value ? parseInt(value.split('-')[0]) : today.getFullYear());
  const [vm, setVM] = useState(value ? parseInt(value.split('-')[1]) - 1 : today.getMonth());

  const dim = getDaysInMonth(vy, vm);
  const first = getFirstDayMon(vy, vm);
  const cells: (number | null)[] = Array.from({ length: first }, () => null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const prevM = () => { if (vm === 0) { setVY(y => y - 1); setVM(11); } else setVM(m => m - 1); };
  const nextM = () => { if (vm === 11) { setVY(y => y + 1); setVM(0); } else setVM(m => m + 1); };

  const selDate = value ? new Date(value + 'T00:00') : null;
  const isSel = (d: number) => !!selDate && selDate.getFullYear() === vy && selDate.getMonth() === vm && selDate.getDate() === d;
  const isToday = (d: number) => today.getFullYear() === vy && today.getMonth() === vm && today.getDate() === d;

  const pick = (d: number) => {
    onChange(`${vy}-${String(vm + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    onClose();
  };

  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.borderHi}`, borderRadius: 14, padding: '14px 16px', boxShadow: '0 16px 48px rgba(0,0,0,0.5)', animation: 'pickerFadeIn 0.15s ease-out' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={prevM} style={{ background: 'none', border: 'none', color: T.textSec, cursor: 'pointer', fontSize: 20, padding: '2px 8px', borderRadius: 6 }}>‹</button>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{MONTHS_ES[vm]} {vy}</span>
        <button onClick={nextM} style={{ background: 'none', border: 'none', color: T.textSec, cursor: 'pointer', fontSize: 20, padding: '2px 8px', borderRadius: 6 }}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {DAYS_ES.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 10, color: T.textTer, fontWeight: 600, letterSpacing: 0.5, padding: '2px 0' }}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((d, i) => (
          <div
            key={i}
            onClick={d !== null ? () => pick(d) : undefined}
            style={{
              height: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: d !== null && isSel(d) ? 700 : 400,
              borderRadius: 6,
              cursor: d !== null ? 'pointer' : 'default',
              color: d === null ? 'transparent' : isSel(d) ? '#fff' : isToday(d) ? T.primary : T.text,
              background: d !== null && isSel(d) ? T.primary : d !== null && isToday(d) ? T.primarySoft : 'transparent',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={d !== null && !isSel(d) ? (e) => { e.currentTarget.style.background = T.primarySoft; } : undefined}
            onMouseLeave={d !== null && !isSel(d) ? (e) => { e.currentTarget.style.background = d !== null && isToday(d) ? T.primarySoft : 'transparent'; } : undefined}
          >
            {d ?? ''}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Date + Time Picker ───────────────────────────────────────────────────────

export function DateTimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [showCal, setShowCal] = useState(false);
  const datePart = value ? value.split('T')[0] : '';
  const timePart = value ? (value.split('T')[1] || '').slice(0, 5) : '09:00';

  const handleDate = (d: string) => onChange(d ? `${d}T${timePart}` : '');
  const handleTime = (t: string) => { if (datePart) onChange(`${datePart}T${t}`); };

  const displayDate = datePart
    ? new Date(datePart + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Seleccionar fecha';

  return (
    <>
      <style>{`@keyframes pickerFadeIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }`}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={() => setShowCal(v => !v)}
          style={{
            padding: '9px 12px',
            background: T.bg,
            border: `1px solid ${datePart ? 'rgba(99,102,241,0.4)' : T.border}`,
            borderRadius: 8,
            color: datePart ? T.text : T.textTer,
            fontSize: 13,
            fontFamily: 'inherit',
            cursor: 'pointer',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            boxSizing: 'border-box',
            transition: 'border-color 0.2s',
          } as React.CSSProperties}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.textTer} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          {displayDate}
        </button>
        {showCal && <CalendarPopup value={datePart} onChange={handleDate} onClose={() => setShowCal(false)} />}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <TimeDrumPicker value={timePart} onChange={handleTime} />
        </div>
      </div>
    </>
  );
}
