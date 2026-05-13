// Btn.jsx
import React from 'react';

const variants = {
  primary: { bg: '#0F2B4A', color: '#fff', border: '#0F2B4A', hover: '#163A60' },
  gold: { bg: '#C9920A', color: '#fff', border: '#C9920A', hover: '#b07d08' },
  success: { bg: '#166534', color: '#fff', border: '#166534', hover: '#145c2d' },
  danger: { bg: '#991B1B', color: '#fff', border: '#991B1B', hover: '#7f1717' },
  outline: { bg: 'transparent', color: '#0F2B4A', border: '#0F2B4A', hover: '#EEF4FA' },
  ghost: { bg: 'transparent', color: '#5A6272', border: '#DDE1E7', hover: '#F8F9FA' },
};
const sizes = { sm: '6px 12px', md: '8px 16px', lg: '11px 22px' };
const fontSizes = { sm: 13, md: 14, lg: 15 };

export function Btn({ variant = 'primary', size = 'md', icon, disabled, full, loading, children, onClick, type = 'button', style = {} }) {
  const v = variants[variant] || variants.primary;
  return (
    <button type={type} disabled={disabled || loading} onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: sizes[size], fontSize: fontSizes[size],
      fontFamily: 'DM Sans,sans-serif', fontWeight: 500, borderRadius: 8, border: `1.5px solid ${v.border}`,
      background: v.bg, color: v.color, cursor: disabled || loading ? 'not-allowed' : 'pointer',
      opacity: disabled || loading ? 0.6 : 1, width: full ? '100%' : 'auto', justifyContent: 'center',
      transition: 'background 0.15s', ...style,
    }} onMouseEnter={e => { if (!disabled && !loading) e.currentTarget.style.background = v.hover; }}
      onMouseLeave={e => { e.currentTarget.style.background = v.bg; }}>
      {loading ? <span style={{ width: 14, height: 14, border: `2px solid ${v.color}40`, borderTop: `2px solid ${v.color}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} /> : icon}
      {children}
    </button>
  );
}

// Badge.jsx
const badgeStyles = {
  green: { bg: '#F0FDF4', color: '#166534', border: '#BBF7D0' },
  red: { bg: '#FEF2F2', color: '#991B1B', border: '#FECACA' },
  amber: { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A' },
  navy: { bg: '#EEF4FA', color: '#0F2B4A', border: '#A8C5E0' },
  teal: { bg: '#F0FDFA', color: '#0F766E', border: '#99F6E4' },
  purple: { bg: '#F5F3FF', color: '#6D28D9', border: '#DDD6FE' },
  gold: { bg: '#FFFBF0', color: '#C9920A', border: '#F5E6BE' },
  gray: { bg: '#F8F9FA', color: '#5A6272', border: '#DDE1E7' },
};

export function Badge({ variant = 'gray', dot, children, style = {} }) {
  const s = badgeStyles[variant] || badgeStyles.gray;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 12, fontWeight: 500, fontFamily: 'DM Sans,sans-serif', background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: 'nowrap', ...style }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0 }} />}
      {children}
    </span>
  );
}

// Card.jsx
export function Card({ title, action, children, noPad, style = {} }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #DDE1E7', borderRadius: 12, ...style }}>
      {title && (
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #DDE1E7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontFamily: 'Playfair Display,serif', color: '#0F2B4A', fontWeight: 600 }}>{title}</h3>
          {action && <div>{action}</div>}
        </div>
      )}
      <div style={noPad ? {} : { padding: 20 }}>{children}</div>
    </div>
  );
}

// StatCard.jsx
export function StatCard({ icon, label, value, sub, color = '#0F2B4A', trend }) {
  const iconBg = color + '20';
  return (
    <div style={{ background: '#fff', border: '1px solid #DDE1E7', borderRadius: 12, padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div style={{ width: 44, height: 44, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 20, color }}>{icon}</span>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: '#7B8494', fontFamily: 'DM Sans,sans-serif', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#1A1D23', fontFamily: 'DM Sans,sans-serif', lineHeight: 1.2 }}>{value}</div>
        {(sub || trend) && (
          <div style={{ fontSize: 12, color: trend?.up ? '#166534' : trend?.down ? '#991B1B' : '#7B8494', marginTop: 2 }}>
            {trend && <span>{trend.up ? '↑' : '↓'} </span>}{sub}
          </div>
        )}
      </div>
    </div>
  );
}

// Input.jsx
export function Input({ label, placeholder, type = 'text', icon, error, helper, value, onChange, name, required, disabled, style = {} }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      {label && <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', fontFamily: 'DM Sans,sans-serif' }}>{label}{required && <span style={{ color: '#991B1B' }}> *</span>}</label>}
      <div style={{ position: 'relative' }}>
        {icon && <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#7B8494', pointerEvents: 'none' }}>{icon}</span>}
        <input type={type} placeholder={placeholder} name={name} value={value} onChange={onChange} required={required} disabled={disabled}
          style={{ width: '100%', padding: icon ? '8px 12px 8px 34px' : '8px 12px', fontSize: 14, fontFamily: 'DM Sans,sans-serif', border: `1px solid ${error ? '#FECACA' : '#DDE1E7'}`, borderRadius: 8, background: disabled ? '#F8F9FA' : '#fff', color: '#1A1D23', outline: 'none', boxSizing: 'border-box' }} />
      </div>
      {error && <span style={{ fontSize: 12, color: '#991B1B' }}>{error}</span>}
      {helper && !error && <span style={{ fontSize: 12, color: '#7B8494' }}>{helper}</span>}
    </div>
  );
}

// Select.jsx
export function Select({ label, options = [], value, onChange, name, required, error, placeholder, disabled, style = {} }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      {label && <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', fontFamily: 'DM Sans,sans-serif' }}>{label}{required && <span style={{ color: '#991B1B' }}> *</span>}</label>}
      <select name={name} value={value} onChange={onChange} required={required} disabled={disabled}
        style={{ padding: '8px 12px', fontSize: 14, fontFamily: 'DM Sans,sans-serif', border: `1px solid ${error ? '#FECACA' : '#DDE1E7'}`, borderRadius: 8, background: '#fff', color: '#1A1D23', outline: 'none', cursor: disabled ? 'not-allowed' : 'pointer', width: '100%', boxSizing: 'border-box' }}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => {
          const val = typeof o === 'object' ? o.value : o;
          const lbl = typeof o === 'object' ? o.label : o;
          return <option key={val} value={val}>{lbl}</option>;
        })}
      </select>
      {error && <span style={{ fontSize: 12, color: '#991B1B' }}>{error}</span>}
    </div>
  );
}

// Table.jsx
export function Table({ columns = [], rows = [], onRowClick, loading, emptyMessage = 'No records found.' }) {
  if (loading) return <LoadingSkeleton rows={5} />;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans,sans-serif', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#F8F9FA' }}>
            {columns.map(col => (
              <th key={col.key || col.label} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#5A6272', borderBottom: '1px solid #DDE1E7', whiteSpace: 'nowrap' }}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} style={{ padding: 32, textAlign: 'center', color: '#7B8494' }}>{emptyMessage}</td></tr>
          ) : rows.map((row, i) => (
            <tr key={row.id || i} onClick={() => onRowClick?.(row)} style={{ borderBottom: '1px solid #DDE1E7', cursor: onRowClick ? 'pointer' : 'default' }}
              onMouseEnter={e => onRowClick && (e.currentTarget.style.background = '#F8F9FA')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}>
              {columns.map(col => (
                <td key={col.key || col.label} style={{ padding: '10px 12px', color: '#1A1D23', verticalAlign: 'middle' }}>
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Modal.jsx
export function Modal({ title, onClose, wide, children }) {
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handler = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', handler);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', handler); };
  }, [onClose]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,43,74,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: wide ? 720 : 540, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #DDE1E7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#0F2B4A' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#7B8494', padding: 4 }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

// Sidebar.jsx
export function Sidebar({ items = [], active, onSelect, user, onLogout }) {
  return (
    <div style={{ width: 240, minHeight: '100vh', background: '#0F2B4A', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ fontFamily: 'Playfair Display,serif', color: '#C9920A', fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>Harvest Mission</div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 }}>College Management</div>
      </div>
      <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
        {items.map((item, i) => {
          if (item.divider) return <div key={i} style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '6px 12px' }} />;
          const isActive = active === item.key;
          return (
            <button key={item.key} onClick={() => onSelect?.(item.key)} style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 16px', border: 'none',
              background: isActive ? 'rgba(201,146,10,0.15)' : 'transparent', color: isActive ? '#C9920A' : 'rgba(255,255,255,0.75)',
              cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans,sans-serif', textAlign: 'left', borderLeft: isActive ? '3px solid #C9920A' : '3px solid transparent',
            }}>
              <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && <span style={{ background: '#991B1B', color: '#fff', borderRadius: 10, fontSize: 11, padding: '1px 6px', minWidth: 18, textAlign: 'center' }}>{item.badge}</span>}
            </button>
          );
        })}
      </nav>
      {user && (
        <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#C9920A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
              {user.name?.charAt(0) || '?'}
            </div>
            <div>
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 500 }}>{user.name}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>{user.display_id}</div>
            </div>
          </div>
          <button onClick={onLogout} style={{ width: '100%', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, color: 'rgba(255,255,255,0.6)', padding: '6px 10px', cursor: 'pointer', fontSize: 12, fontFamily: 'DM Sans,sans-serif' }}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// TopBar.jsx
export function TopBar({ title, subtitle, notifCount = 0, onNotifClick, onMenuClick }) {
  return (
    <div style={{ height: 56, background: '#fff', borderBottom: '1px solid #DDE1E7', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12, flexShrink: 0 }}>
      {onMenuClick && (
        <button onClick={onMenuClick} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#5A6272', display: 'none', padding: 4 }} className="hamburger">☰</button>
      )}
      <div style={{ flex: 1 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontFamily: 'Playfair Display,serif', color: '#0F2B4A', lineHeight: 1 }}>{title}</h2>
        {subtitle && <div style={{ fontSize: 12, color: '#7B8494', marginTop: 2 }}>{subtitle}</div>}
      </div>
      <button onClick={onNotifClick} style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: '#5A6272', fontSize: 18 }}>
        🔔
        {notifCount > 0 && <span style={{ position: 'absolute', top: 2, right: 2, width: 16, height: 16, background: '#991B1B', color: '#fff', borderRadius: '50%', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{notifCount > 9 ? '9+' : notifCount}</span>}
      </button>
    </div>
  );
}

// PageWrapper.jsx
export function PageWrapper({ sidebar, children, topbar }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {sidebar}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {topbar}
        <main style={{ flex: 1, overflowY: 'auto', padding: 24, background: '#F8F9FA' }}>
          {children}
        </main>
      </div>
    </div>
  );
}

// SearchInput.jsx
export function SearchInput({ value, onChange, placeholder = 'Search…', style = {} }) {
  const [local, setLocal] = React.useState(value || '');
  const timerRef = React.useRef(null);
  const handleChange = (e) => {
    setLocal(e.target.value);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange?.(e.target.value), 300);
  };
  return (
    <div style={{ position: 'relative', ...style }}>
      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#7B8494' }}>🔍</span>
      <input value={local} onChange={handleChange} placeholder={placeholder}
        style={{ padding: '8px 12px 8px 32px', fontSize: 13, fontFamily: 'DM Sans,sans-serif', border: '1px solid #DDE1E7', borderRadius: 8, width: '100%', outline: 'none', boxSizing: 'border-box' }} />
      {local && <button onClick={() => { setLocal(''); onChange?.(''); }} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#7B8494', fontSize: 14 }}>×</button>}
    </div>
  );
}

// Pagination.jsx
export function Pagination({ page, total, pageSize = 20, onChange }) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', padding: '12px 0', fontFamily: 'DM Sans,sans-serif', fontSize: 13 }}>
      <span style={{ color: '#7B8494', marginRight: 8 }}>Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} of {total}</span>
      <button onClick={() => onChange(page - 1)} disabled={page <= 1} style={{ padding: '4px 10px', border: '1px solid #DDE1E7', borderRadius: 6, cursor: page <= 1 ? 'not-allowed' : 'pointer', background: '#fff', color: page <= 1 ? '#A0A8B4' : '#0F2B4A' }}>←</button>
      {Array.from({ length: Math.min(5, pages) }, (_, i) => {
        const p = Math.max(1, Math.min(page - 2, pages - 4)) + i;
        return (
          <button key={p} onClick={() => onChange(p)} style={{ padding: '4px 10px', border: '1px solid #DDE1E7', borderRadius: 6, cursor: 'pointer', background: p === page ? '#0F2B4A' : '#fff', color: p === page ? '#fff' : '#0F2B4A' }}>{p}</button>
        );
      })}
      <button onClick={() => onChange(page + 1)} disabled={page >= pages} style={{ padding: '4px 10px', border: '1px solid #DDE1E7', borderRadius: 6, cursor: page >= pages ? 'not-allowed' : 'pointer', background: '#fff', color: page >= pages ? '#A0A8B4' : '#0F2B4A' }}>→</button>
    </div>
  );
}

// Tabs.jsx
export function Tabs({ tabs = [], active, onChange, variant = 'underline' }) {
  if (variant === 'pill') {
    return (
      <div style={{ display: 'flex', gap: 6, padding: 4, background: '#F8F9FA', borderRadius: 10, border: '1px solid #DDE1E7', width: 'fit-content' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => onChange(t.key)} style={{ padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans,sans-serif', fontWeight: 500, background: active === t.key ? '#0F2B4A' : 'transparent', color: active === t.key ? '#fff' : '#5A6272' }}>{t.label}{t.badge ? ` (${t.badge})` : ''}</button>
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', borderBottom: '2px solid #DDE1E7', gap: 0, overflowX: 'auto' }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{ padding: '10px 18px', border: 'none', borderBottom: active === t.key ? '2px solid #C9920A' : '2px solid transparent', marginBottom: -2, cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans,sans-serif', fontWeight: active === t.key ? 600 : 400, color: active === t.key ? '#C9920A' : '#5A6272', background: 'none', whiteSpace: 'nowrap' }}>{t.label}{t.badge ? <span style={{ marginLeft: 6, background: '#DDE1E7', borderRadius: 10, padding: '1px 6px', fontSize: 11 }}>{t.badge}</span> : null}</button>
      ))}
    </div>
  );
}

// LoadingSkeleton.jsx
export function LoadingSkeleton({ rows = 3, height = 40 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ height, background: 'linear-gradient(90deg, #F8F9FA 25%, #EEF4FA 50%, #F8F9FA 75%)', backgroundSize: '200% 100%', borderRadius: 8, animation: 'shimmer 1.5s infinite' }} />
      ))}
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// EmptyState.jsx
export function EmptyState({ icon = '📋', message, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: '#7B8494', fontFamily: 'DM Sans,sans-serif' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 15, color: '#5A6272', marginBottom: 16 }}>{message}</div>
      {action}
    </div>
  );
}

// ConfirmDialog.jsx
export function ConfirmDialog({ title, message, onConfirm, onCancel, danger }) {
  return (
    <Modal title={title || 'Confirm action'} onClose={onCancel}>
      <div style={{ padding: 24 }}>
        <p style={{ color: '#3D4450', fontFamily: 'DM Sans,sans-serif', margin: '0 0 24px' }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>Confirm</Btn>
        </div>
      </div>
    </Modal>
  );
}

// CurrencyDisplay.jsx
export function CurrencyDisplay({ amount, currency = 'INR', style = {} }) {
  const formatted = currency === 'USD'
    ? `$${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `₹${Number(amount || 0).toLocaleString('en-IN')}`;
  return <span style={{ fontFamily: 'DM Sans,sans-serif', ...style }}>{formatted}</span>;
}

// Timeline.jsx
export function Timeline({ items = [] }) {
  return (
    <div style={{ position: 'relative', paddingLeft: 24 }}>
      <div style={{ position: 'absolute', left: 8, top: 0, bottom: 0, width: 2, background: '#DDE1E7' }} />
      {items.map((item, i) => (
        <div key={i} style={{ position: 'relative', paddingBottom: 20 }}>
          <div style={{ position: 'absolute', left: -20, top: 3, width: 12, height: 12, borderRadius: '50%', background: item.color || '#0F2B4A', border: '2px solid #fff', boxShadow: '0 0 0 2px #DDE1E7' }} />
          <div style={{ fontFamily: 'DM Sans,sans-serif' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1D23' }}>{item.title}</div>
            {item.subtitle && <div style={{ fontSize: 12, color: '#7B8494', marginTop: 2 }}>{item.subtitle}</div>}
            {item.date && <div style={{ fontSize: 11, color: '#A0A8B4', marginTop: 2 }}>{item.date}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
