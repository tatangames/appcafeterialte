export const dinero = (valor: number | string | null | undefined): string => {
  const n = Number(valor ?? 0);
  return `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`;
};

export const cantidad = (valor: number): string => String(Math.round(valor * 1000) / 1000);

// "hh:mm:ss" desde una fecha "AAAA-MM-DD HH:MM:SS" del servidor (hora local del negocio)
export const transcurrido = (desde: string, ahora: number = Date.now()): string => {
  const inicio = new Date(desde.replace(' ', 'T')).getTime();
  const s = Math.max(0, Math.floor((ahora - inicio) / 1000));
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(Math.floor(s / 3600))}:${dos(Math.floor((s % 3600) / 60))}:${dos(s % 60)}`;
};

export const hora = (fecha: string): string => fecha.slice(11, 16);

/**
 * Fecha del servidor para mostrar: "2026-11-01" → "01-11-2026" y
 * "2026-11-01 14:05[:00]" (o ISO) → "01-11-2026 14:05" (hora de 24 h).
 */
export const fecha = (valor: string | null | undefined): string => {
  if (!valor) return '';
  const m = valor.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return valor;
  const dia = `${m[3]}-${m[2]}-${m[1]}`;
  return m[4] ? `${dia} ${m[4]}:${m[5]}` : dia;
};

// uuid v4 para que un cobro reintentado no se registre dos veces
export const nuevoUuid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

// Fecha local "AAAA-MM-DD" (la del negocio, no UTC)
export const hoy = (desplazarDias = 0): string => {
  const d = new Date();
  d.setDate(d.getDate() + desplazarDias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
