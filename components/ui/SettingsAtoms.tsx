// Settings page atomic UI components
// Adapted from design_handoff_configuracion for the web-only configuration tab.
// Uses HTML elements directly (div, button, input, span) since the only consumer
// is configuracion.web.tsx. Ionicons for icons, DESIGN_TOKENS for colors.

import { useState, useRef, useEffect, ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { useResponsive } from '@/lib/hooks/useResponsive';

const T = DESIGN_TOKENS;

// ---------------------------------------------------------------------------
// CSS injection (keyframes + number input spinner reset)
// ---------------------------------------------------------------------------
if (typeof document !== 'undefined') {
  const id = 'settings-atoms-css';
  if (!document.getElementById(id)) {
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      @keyframes pulseDot{0%,100%{opacity:1}50%{opacity:.5}}
      .sa-num::-webkit-inner-spin-button,.sa-num::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
      .sa-num{-moz-appearance:textfield}
      .sa-tip{position:relative;display:inline-flex}
      .sa-tip-bubble{position:absolute;left:50%;bottom:calc(100% + 8px);transform:translateX(-50%);background:#241a14;color:#fff;padding:8px 11px;border-radius:9px;font-size:11.5px;line-height:1.45;font-weight:500;width:max-content;max-width:240px;box-shadow:0 10px 28px rgba(28,24,20,0.28);opacity:0;visibility:hidden;transition:opacity .14s ease;z-index:200;pointer-events:none;text-align:left;white-space:normal}
      .sa-tip-bubble::after{content:'';position:absolute;top:100%;left:50%;transform:translateX(-50%);border:5px solid transparent;border-top-color:#241a14}
      .sa-tip:hover .sa-tip-bubble,.sa-tip:active .sa-tip-bubble{opacity:1;visibility:visible}
    `;
    document.head.appendChild(style);
  }
}

// ---------------------------------------------------------------------------
// Icon helper — maps handoff lucide names to Ionicons
// ---------------------------------------------------------------------------
const ICON_MAP: Record<string, string> = {
  building: 'business-outline',
  clock: 'time-outline',
  scissors: 'cut-outline',
  calendar: 'calendar-outline',
  percent: 'stats-chart-outline',
  bell: 'notifications-outline',
  shield: 'shield-outline',
  globe: 'globe-outline',
  plus: 'add',
  edit: 'create-outline',
  trash: 'trash-outline',
  x: 'close',
  check: 'checkmark',
  chevR: 'chevron-forward',
  chevD: 'chevron-down',
  chevU: 'chevron-up',
  search: 'search-outline',
  upload: 'cloud-upload-outline',
  info: 'information-circle-outline',
  warning: 'warning-outline',
  lock: 'lock-closed-outline',
  link: 'link-outline',
  mail: 'mail-outline',
  phone: 'call-outline',
  map: 'location-outline',
  copy: 'copy-outline',
  eye: 'eye-outline',
  eyeOff: 'eye-off-outline',
  external: 'open-outline',
  refresh: 'refresh-outline',
  star: 'star-outline',
  image: 'image-outline',
  gift: 'gift-outline',
  users: 'people-outline',
  reorderFour: 'reorder-four-outline',
  pricetag: 'pricetag-outline',
  chevronBack: 'chevron-back',
};

export function SettingsIcon({ name, size = 16, color }: { name: string; size?: number; color?: string }) {
  const mapped = ICON_MAP[name] || name;
  return <Ionicons name={mapped as any} size={size} color={color || 'currentColor'} />;
}

// ===================================================================
//  LAYOUT ATOMS
// ===================================================================

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------
interface SectionProps {
  title: string;
  desc?: string;
  action?: ReactNode;
  soon?: boolean;
  disabled?: boolean;
  children: ReactNode;
  dense?: boolean;
  id?: string;
}

export function Section({ title, desc, action, soon, disabled, children, dense, id }: SectionProps) {
  return (
    <section id={id} style={{
      background: T.bgCard,
      border: `1px solid ${T.border}`,
      borderRadius: 14,
      padding: dense ? '18px 20px 10px' : '22px 24px 12px',
      marginBottom: 16,
      opacity: disabled ? 0.65 : 1,
      position: 'relative' as const,
    }}>
      {/* flexWrap + base flexible del titulo: sin esto, una action ancha (p. ej.
          el selector de plantillas de Horarios) aplastaba el titulo a una
          palabra por linea en movil */}
      <header style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 16, marginBottom: 18, flexWrap: 'wrap',
      }}>
        <div style={{ minWidth: 0, flex: '1 1 220px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: -0.1, color: T.text }}>{title}</h3>
            {soon && <SoonBadge />}
          </div>
          {desc && (
            <p style={{ margin: 0, fontSize: 11.5, color: T.textTer, lineHeight: 1.55, maxWidth: 540 }}>{desc}</p>
          )}
        </div>
        {action && <div style={{ maxWidth: '100%' }}>{action}</div>}
      </header>
      <div>{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// InfoHint — circulo "i" con globo (tooltip) al pasar el raton. Sustituye al
// texto de ayuda siempre-visible para descongestionar el formulario.
// ---------------------------------------------------------------------------
export function InfoHint({ text }: { text: string }) {
  return (
    <span className="sa-tip" style={{ cursor: 'help', flexShrink: 0, lineHeight: 0, display: 'inline-flex', alignItems: 'center' }}>
      <SettingsIcon name="info" size={16} color={T.textTer} />
      <span className="sa-tip-bubble" role="tooltip">{text}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// FieldRow
// ---------------------------------------------------------------------------
interface FieldRowProps {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
  full?: boolean;
  disabled?: boolean;
  action?: ReactNode;
}

export function FieldRow({ label, hint, htmlFor, children, full, disabled, action }: FieldRowProps) {
  const { isMobile } = useResponsive();
  // Apilado en movil o cuando full: el control ocupa todo el ancho de la fila y
  // se le deja crecer (flex 1 1 100%) con minWidth/maxWidth 0/100% para que no
  // se salga del marco. En escritorio el control va por contenido (0 1 auto).
  const stacked = full || isMobile;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: stacked ? '1fr' : '220px 1fr',
      alignItems: stacked ? 'flex-start' : 'center',
      gap: stacked ? 8 : 24,
      padding: '14px 0',
      borderTop: `1px solid ${T.border}`,
      opacity: disabled ? 0.55 : 1,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label htmlFor={htmlFor} style={{
            fontSize: 12.5, fontWeight: 600, color: T.text,
          }}>{label}</label>
          {hint && <InfoHint text={hint} />}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const, justifyContent: 'flex-start', minWidth: 0, minHeight: 36 }}>
        <div style={{ flex: stacked ? '1 1 100%' : '0 1 auto', minWidth: 0, maxWidth: '100%' }}>{children}</div>
        {action && <div style={{ marginLeft: stacked ? 0 : 'auto' }}>{action}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FieldStack — removes top border on first FieldRow child visually
// ---------------------------------------------------------------------------
export function FieldStack({ children }: { children: ReactNode }) {
  return <div style={{ borderTop: '1px solid transparent', marginTop: -1 }}>{children}</div>;
}

// ===================================================================
//  FORM ATOMS
// ===================================================================

// ---------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------
interface ToggleProps {
  on: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
  sub?: string;
  accent?: string;
}

export function Toggle({ on, onChange, disabled, label, sub, accent }: ToggleProps) {
  const c = accent || T.primary;
  const handleClick = () => { if (!disabled && onChange) onChange(!on); };
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: disabled ? 'not-allowed' : 'pointer', userSelect: 'none' as const }}
      onClick={handleClick}
    >
      <div
        role="switch"
        aria-checked={on}
        style={{
          width: 36, height: 20, borderRadius: 999,
          background: on ? (disabled ? 'rgba(244,80,30,0.25)' : `${c}55`) : 'rgba(148,163,184,0.16)',
          position: 'relative' as const, transition: 'background .2s ease',
          flexShrink: 0, border: `1px solid ${on ? c + '40' : T.border}`,
        }}
      >
        <div style={{
          position: 'absolute' as const, top: 1, left: on ? 17 : 1,
          width: 16, height: 16, borderRadius: 999,
          background: on ? c : T.textTer,
          boxShadow: on && !disabled ? `0 0 8px ${c}80` : 'none',
          transition: 'left .2s cubic-bezier(.4,1.4,.6,1), background .2s, box-shadow .2s',
        }} />
      </div>
      {(label || sub) && (
        <div>
          {label && <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text }}>{label}</div>}
          {sub && <div style={{ fontSize: 11, color: T.textTer, marginTop: 1 }}>{sub}</div>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NumberInput
// ---------------------------------------------------------------------------
interface NumberInputProps {
  value: number | string;
  onChange: (v: number | string) => void;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  width?: number;
  disabled?: boolean;
  mono?: boolean;
}

export function NumberInput({ value, onChange, unit, min = 0, max = 9999, step = 1, width = 140, disabled, mono }: NumberInputProps) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center',
      width, height: 36,
      background: T.bg,
      border: `1px solid ${focus ? T.primary : T.border}`,
      borderRadius: 9,
      transition: 'border-color .15s, box-shadow .15s',
      boxShadow: focus ? `0 0 0 3px ${T.primarySoft}` : 'none',
      overflow: 'hidden',
      opacity: disabled ? 0.5 : 1,
    }}>
      {/* Stepper buttons */}
      <div style={{ display: 'flex', flexDirection: 'column' as const, borderRight: `1px solid ${T.border}`, height: '100%' }}>
        <button
          disabled={disabled}
          onClick={() => onChange(Math.min(max, (Number(value) || 0) + step))}
          style={{
            flex: 1, width: 22, background: 'transparent', border: 'none', color: T.textSec,
            cursor: disabled ? 'not-allowed' : 'pointer', display: 'grid', placeItems: 'center',
            borderBottom: `1px solid ${T.border}`, padding: 0,
          }}
          onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.color = T.text; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = T.textSec; }}
        >
          <Ionicons name="chevron-up" size={10} color="currentColor" />
        </button>
        <button
          disabled={disabled}
          onClick={() => onChange(Math.max(min, (Number(value) || 0) - step))}
          style={{
            flex: 1, width: 22, background: 'transparent', border: 'none', color: T.textSec,
            cursor: disabled ? 'not-allowed' : 'pointer', display: 'grid', placeItems: 'center', padding: 0,
          }}
          onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.color = T.text; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = T.textSec; }}
        >
          <Ionicons name="chevron-down" size={10} color="currentColor" />
        </button>
      </div>

      <input
        type="number"
        className="sa-num"
        disabled={disabled}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
          color: T.text, fontSize: 13, fontWeight: 600, padding: '0 8px',
          fontFamily: mono ? "'JetBrains Mono', monospace" : 'inherit',
          textAlign: 'right' as const, MozAppearance: 'textfield' as any,
        }}
      />
      {unit && (
        <div style={{ padding: '0 10px 0 4px', fontSize: 11, color: T.textTer, fontWeight: 600, letterSpacing: 0.2 }}>{unit}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TextInput
// ---------------------------------------------------------------------------
interface TextInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  width?: number | string;
  disabled?: boolean;
  leadingIcon?: string;
  mono?: boolean;
  type?: string;
}

export function STextInput({ value, onChange, placeholder, width, disabled, leadingIcon, mono, type = 'text' }: TextInputProps) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center',
      width: width || '100%', height: 36,
      background: T.bg,
      border: `1px solid ${focus ? T.primary : T.border}`,
      borderRadius: 9,
      transition: 'border-color .15s, box-shadow .15s',
      boxShadow: focus ? `0 0 0 3px ${T.primarySoft}` : 'none',
      padding: '0 12px',
      opacity: disabled ? 0.5 : 1,
    }}>
      {leadingIcon && (
        <span style={{ marginRight: 8, color: T.textTer, display: 'inline-flex' }}>
          <SettingsIcon name={leadingIcon} size={14} />
        </span>
      )}
      <input
        type={type}
        disabled={disabled}
        value={value || ''}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
          color: T.text, fontSize: 13, fontWeight: 500,
          fontFamily: mono ? "'JetBrains Mono', monospace" : 'inherit',
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Select (custom dropdown)
// ---------------------------------------------------------------------------
interface SelectOption {
  value: string | number;
  label: string;
  hint?: string;
  dot?: string;
}

interface SelectProps {
  value: string | number;
  onChange: (v: any) => void;
  options: SelectOption[];
  width?: number | string;
  disabled?: boolean;
  placeholder?: string;
}

export function SSelect({ value, onChange, options, width = 200, disabled, placeholder = 'Selecciona...' }: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const current = options.find(o => o.value === value);

  return (
    <div ref={ref} style={{ position: 'relative' as const, width }}>
      <button
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', height: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: T.bg, border: `1px solid ${open ? T.primary : T.border}`, borderRadius: 9,
          color: current ? T.text : T.textTer, padding: '0 12px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: 13, fontWeight: 500, transition: 'all .15s',
          boxShadow: open ? `0 0 0 3px ${T.primarySoft}` : 'none',
        }}
        onMouseEnter={e => { if (!disabled && !open) (e.currentTarget as HTMLElement).style.borderColor = T.borderHi; }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.borderColor = T.border; }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
          {current?.label || placeholder}
        </span>
        <span style={{
          display: 'inline-flex', color: T.textSec,
          transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0)',
        }}>
          <Ionicons name="chevron-down" size={12} color={T.textSec} />
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute' as const, top: 'calc(100% + 4px)', left: 0, right: 0,
          background: T.bgPanel, border: `1px solid ${T.borderHi}`, borderRadius: 10,
          boxShadow: '0 16px 40px rgba(28,24,20,0.18)', padding: 4, zIndex: 50,
          maxHeight: 280, overflowY: 'auto' as const,
        }}>
          {options.map(o => {
            const active = o.value === value;
            return (
              <button
                key={String(o.value)}
                onClick={() => { onChange(o.value); setOpen(false); }}
                style={{
                  width: '100%', textAlign: 'left' as const, padding: '8px 10px', borderRadius: 7,
                  background: active ? T.primarySoft : 'transparent',
                  border: 'none', color: active ? T.text : T.textSec,
                  cursor: 'pointer', fontSize: 13, fontWeight: active ? 600 : 500,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  transition: 'background .12s',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(244,80,30,0.06)'; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {o.dot && <span style={{ width: 8, height: 8, borderRadius: 999, background: o.dot }} />}
                  <span>{o.label}</span>
                  {o.hint && <span style={{ fontSize: 10.5, color: T.textTer }}>{o.hint}</span>}
                </span>
                {active && <Ionicons name="checkmark" size={13} color={T.primary} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------------
interface SegmentedOption {
  value: string | number;
  label: string;
}

interface SegmentedProps {
  value: string | number;
  onChange: (v: any) => void;
  options: SegmentedOption[];
  disabled?: boolean;
}

export function Segmented({ value, onChange, options, disabled }: SegmentedProps) {
  return (
    <div style={{
      display: 'inline-flex', padding: 3, background: T.bg,
      border: `1px solid ${T.border}`, borderRadius: 10,
      opacity: disabled ? 0.5 : 1,
    }}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            style={{
              padding: '6px 14px', borderRadius: 7, border: 'none',
              cursor: disabled ? 'not-allowed' : 'pointer',
              background: active ? T.primarySoft : 'transparent',
              color: active ? T.text : T.textSec,
              fontSize: 12, fontWeight: active ? 600 : 500,
              transition: 'all .15s', whiteSpace: 'nowrap' as const,
              boxShadow: active ? `inset 0 0 0 1px ${T.primary}40` : 'none',
            }}
            onMouseEnter={e => { if (!active && !disabled) (e.currentTarget as HTMLElement).style.color = T.text; }}
            onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = T.textSec; }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DayPicker (Lun - Dom)
// ---------------------------------------------------------------------------
interface DayPickerProps {
  value: number[];
  onChange: (v: number[]) => void;
  disabled?: boolean;
}

export function DayPicker({ value, onChange, disabled }: DayPickerProps) {
  const { isMobile } = useResponsive();
  const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const labels = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];
  return (
    <div style={{ display: 'flex', gap: isMobile ? 4 : 6, flexWrap: 'wrap', opacity: disabled ? 0.5 : 1 }}>
      {days.map((d, i) => {
        const on = value.includes(i);
        const isWeekend = i >= 5;
        return (
          <button
            key={i}
            disabled={disabled}
            title={labels[i]}
            onClick={() => onChange(on ? value.filter(v => v !== i) : [...value, i].sort())}
            style={{
              width: isMobile ? 32 : 38, height: isMobile ? 32 : 38, borderRadius: 10,
              background: on ? T.primarySoft : T.bg,
              border: `1px solid ${on ? T.primary + '66' : T.border}`,
              color: on ? T.primaryHi : (isWeekend ? T.textTer : T.textSec),
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontSize: 12, fontWeight: 700,
              transition: 'all .15s',
            }}
            onMouseEnter={e => {
              if (!disabled && !on) {
                (e.currentTarget as HTMLElement).style.borderColor = T.borderHi;
                (e.currentTarget as HTMLElement).style.color = T.text;
              }
            }}
            onMouseLeave={e => {
              if (!on) {
                (e.currentTarget as HTMLElement).style.borderColor = T.border;
                (e.currentTarget as HTMLElement).style.color = isWeekend ? T.textTer : T.textSec;
              }
            }}
          >
            {d}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TimeInput (HH:MM) — delegates to STextInput
// ---------------------------------------------------------------------------
interface TimeInputProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

export function TimeInput({ value, onChange, disabled }: TimeInputProps) {
  return <STextInput value={value} onChange={onChange} disabled={disabled} width={110} mono placeholder="--:--" />;
}

// ===================================================================
//  DISPLAY ATOMS
// ===================================================================

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------
type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'violet' | 'soon';

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
}

const BADGE_TONES: Record<BadgeTone, { bg: string; color: string; border: string }> = {
  neutral: { bg: 'rgba(148,163,184,0.10)', color: T.textSec, border: T.border },
  primary: { bg: T.primarySoft, color: T.primaryHi, border: 'rgba(244,80,30,0.3)' },
  success: { bg: 'rgba(16,185,129,0.12)', color: T.success, border: 'rgba(16,185,129,0.28)' },
  warning: { bg: 'rgba(245,158,11,0.12)', color: T.warning, border: 'rgba(245,158,11,0.28)' },
  danger:  { bg: 'rgba(239,68,68,0.12)', color: T.danger, border: 'rgba(239,68,68,0.28)' },
  violet:  { bg: 'rgba(192,38,10,0.12)', color: T.violet, border: 'rgba(192,38,10,0.28)' },
  soon:    { bg: 'rgba(245,158,11,0.10)', color: T.warning, border: 'rgba(245,158,11,0.22)' },
};

export function Badge({ children, tone = 'neutral' }: BadgeProps) {
  const t = BADGE_TONES[tone] || BADGE_TONES.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px', borderRadius: 999,
      background: t.bg, border: `1px solid ${t.border}`, color: t.color,
      fontSize: 10, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase' as const,
      whiteSpace: 'nowrap' as const,
    }}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SoonBadge
// ---------------------------------------------------------------------------
export function SoonBadge() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px 3px 7px', borderRadius: 999,
      background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)',
      color: T.warning, fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
      textTransform: 'uppercase' as const,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: 999, background: T.warning,
        animation: 'pulseDot 1.6s ease-in-out infinite',
      }} />
      Proximamente
    </span>
  );
}

// ---------------------------------------------------------------------------
// SoonBanner (used by future/disabled tabs)
// ---------------------------------------------------------------------------
interface SoonBannerProps {
  icon: string;
  title: string;
  desc: string;
}

export function SoonBanner({ icon, title, desc }: SoonBannerProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 14,
      padding: '18px 20px', borderRadius: 14,
      background: 'linear-gradient(135deg, rgba(245,158,11,0.06), rgba(244,80,30,0.04))',
      border: '1px solid rgba(245,158,11,0.18)',
      marginBottom: 16,
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 11, flexShrink: 0,
        background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.28)',
        display: 'grid', placeItems: 'center', color: T.warning,
      }}>
        <SettingsIcon name={icon} size={20} color={T.warning} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: T.text }}>{title}</h3>
          <SoonBadge />
        </div>
        <div style={{ fontSize: 12, color: T.textSec, lineHeight: 1.55, maxWidth: 700 }}>{desc}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatBox
// ---------------------------------------------------------------------------
interface StatBoxProps {
  label: string;
  value: string;
  sub: string;
  accent?: string;
}

export function StatBox({ label, value, sub, accent }: StatBoxProps) {
  return (
    <div style={{
      background: T.bg, border: `1px solid ${T.border}`, borderRadius: 11, padding: 14,
    }}>
      <div style={{
        fontSize: 10, letterSpacing: 1.2, color: T.textTer,
        textTransform: 'uppercase' as const, fontWeight: 600, marginBottom: 6,
      }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: accent || T.text, letterSpacing: -0.3 }}>{value}</div>
      <div style={{ fontSize: 11, color: T.textTer, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

// ===================================================================
//  ACTION ATOMS
// ===================================================================

// ---------------------------------------------------------------------------
// Btn
// ---------------------------------------------------------------------------
type BtnVariant = 'ghost' | 'primary' | 'danger' | 'soft';
type BtnSize = 'sm' | 'md';

interface BtnProps {
  children: ReactNode;
  variant?: BtnVariant;
  size?: BtnSize;
  icon?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
}

const BTN_SIZES: Record<BtnSize, { h: number; px: number; fs: number }> = {
  sm: { h: 28, px: 10, fs: 12 },
  md: { h: 34, px: 14, fs: 13 },
};

const BTN_VARIANTS: Record<BtnVariant, { base: Record<string, any>; hover: Record<string, any> }> = {
  ghost: {
    base: { background: 'transparent', border: `1px solid ${T.border}`, color: T.text },
    hover: { background: 'rgba(148,163,184,0.06)', borderColor: T.borderHi, transform: 'translateY(-1px)' },
  },
  primary: {
    base: {
      background: 'linear-gradient(180deg, #ff7a2e 0%, #f4501e 100%)',
      border: 'none', color: '#fff',
      boxShadow: 'rgba(244,80,30,.35) 0 6px 18px',
    },
    hover: { transform: 'translateY(-1px)', boxShadow: 'rgba(244,80,30,.55) 0 10px 28px' },
  },
  danger: {
    base: { background: 'transparent', border: `1px solid ${T.border}`, color: T.danger },
    hover: { background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,.4)' },
  },
  soft: {
    base: { background: T.bgCard, border: `1px solid ${T.border}`, color: T.text },
    hover: { background: T.bgCardHi, borderColor: T.borderHi, transform: 'translateY(-1px)' },
  },
};

export function Btn({ children, variant = 'ghost', size = 'md', icon, onClick, disabled, type = 'button', title }: BtnProps) {
  const sz = BTN_SIZES[size];
  const v = BTN_VARIANTS[variant];
  const [hov, setHov] = useState(false);

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      title={title}
      onMouseEnter={() => { if (!disabled) setHov(true); }}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, justifyContent: 'center',
        height: sz.h, padding: `0 ${sz.px}px`, borderRadius: 9,
        fontSize: sz.fs, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all .15s ease',
        opacity: disabled ? 0.5 : 1,
        ...v.base,
        ...(hov && !disabled ? v.hover : {}),
      }}
    >
      {icon && <SettingsIcon name={icon} size={size === 'sm' ? 12 : 14} />}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// IconBtn
// ---------------------------------------------------------------------------
type IconBtnTone = 'neutral' | 'primary' | 'danger';

interface IconBtnProps {
  icon: string;
  onClick?: () => void;
  tone?: IconBtnTone;
  size?: number;
  title?: string;
  disabled?: boolean;
}

const ICONBTN_TONES: Record<IconBtnTone, { c: string; hc: string; hbg: string; hb: string }> = {
  neutral: { c: T.textSec, hc: T.text, hbg: 'rgba(148,163,184,.08)', hb: T.borderHi },
  primary: { c: T.primary, hc: T.primaryHi, hbg: T.primarySoft, hb: 'rgba(244,80,30,.4)' },
  danger:  { c: T.danger, hc: T.danger, hbg: 'rgba(239,68,68,.10)', hb: 'rgba(239,68,68,.4)' },
};

export function IconBtn({ icon, onClick, tone = 'neutral', size = 30, title, disabled }: IconBtnProps) {
  const tn = ICONBTN_TONES[tone];
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      onMouseEnter={() => { if (!disabled) setHov(true); }}
      onMouseLeave={() => setHov(false)}
      style={{
        width: size, height: size, borderRadius: 8,
        background: hov ? tn.hbg : 'transparent',
        border: `1px solid ${hov ? tn.hb : T.border}`,
        color: hov ? tn.hc : tn.c,
        display: 'grid', placeItems: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all .15s', opacity: disabled ? 0.5 : 1,
        padding: 0,
      }}
    >
      <SettingsIcon name={icon} size={Math.round(size * 0.46)} color={hov ? tn.hc : tn.c} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// ScopeChip (used in Servicios tab for scope selector)
// ---------------------------------------------------------------------------
interface ScopeChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
  badge?: number | null;
  initials?: string;
  icon?: string;
  hint?: string;
}

export function ScopeChip({ label, active, onClick, color, badge, initials, icon }: ScopeChipProps) {
  const c = color || T.primary;
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '5px 12px 5px 5px', borderRadius: 999,
        background: active ? `${c}1a` : 'rgba(148,163,184,0.04)',
        border: `1px solid ${active ? c + '55' : T.border}`,
        color: active ? (color ? c : T.primaryHi) : T.textSec,
        fontSize: 12, fontWeight: active ? 700 : 500,
        cursor: 'pointer', transition: 'all .15s',
        transform: hov && !active ? 'translateY(-1px)' : 'none',
      }}
    >
      {initials ? (
        <span style={{
          width: 22, height: 22, borderRadius: 999,
          background: `linear-gradient(135deg, ${c}cc, ${c})`,
          display: 'grid', placeItems: 'center', color: '#fff', fontSize: 9, fontWeight: 700,
        }}>{initials}</span>
      ) : icon ? (
        <span style={{
          width: 22, height: 22, borderRadius: 999,
          background: active ? T.primarySoft : 'rgba(148,163,184,0.08)',
          display: 'grid', placeItems: 'center',
        }}>
          <SettingsIcon name={icon} size={11} color={active ? T.primaryHi : T.textSec} />
        </span>
      ) : null}
      <span>{label}</span>
      {badge != null && badge > 0 && (
        <span style={{
          minWidth: 18, height: 16, padding: '0 5px', borderRadius: 999,
          background: c, color: '#fff', fontSize: 9.5, fontWeight: 700,
          display: 'grid', placeItems: 'center',
        }}>{badge}</span>
      )}
    </button>
  );
}
