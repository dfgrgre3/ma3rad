export const ESCAPE_MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch] || ch);

export const timeOf = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—');

export const formatDay = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('ar-EG', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

export const shiftDay = (value: string, days: number) => {
  const next = new Date(`${value}T12:00:00`);
  next.setDate(next.getDate() + days);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
};

export const weekdayOf = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('ar-EG', { weekday: 'short' });
