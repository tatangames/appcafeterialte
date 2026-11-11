// Regla de un grupo de extras: cuántas unidades se eligen en total, contando repeticiones
// (minimo 0 = opcional; maximo null = sin tope). La misma que la web.
export interface ReglaGrupo { minimo?: number; maximo?: number | null; obligatorio?: boolean }

export const minimoDe = (g: ReglaGrupo) => Math.max(g.minimo ?? 0, g.obligatorio ? 1 : 0);
export const maximoDe = (g: ReglaGrupo) => g.maximo ?? null;

/** «elige al menos 1», «máximo 2», «elige de 1 a 2», «elige 1»; vacío si no hay regla. */
export const reglaTexto = (g: ReglaGrupo): string => {
  const min = minimoDe(g);
  const max = maximoDe(g);
  if (min > 0 && max !== null) return min === max ? `elige ${min}` : `elige de ${min} a ${max}`;
  if (min > 0) return `elige al menos ${min}`;
  return max !== null ? `máximo ${max}` : '';
};
