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

/** Explicación de cada ajuste del editor de modificadores (botón «?»). La misma en la web y la tablet. */
export const AYUDAS = {
  requerido: {
    titulo: 'Requerido u Opcional',
    texto: 'Requerido: no deja agregar el producto hasta elegir el mínimo de este bloque. Opcional: el mesero puede dejarlo sin elegir.',
    ejemplo: '«Tipo de leche» requerido: siempre hay que decir cuál. «Extras» opcional: solo si el cliente pide algo.',
  },
  minmax: {
    titulo: 'Mínimo y máximo',
    texto: 'Cuántas opciones se eligen en total en este bloque, contando cada vez que se repite una. En blanco: mínimo 0 y sin tope. Con máximo 1, al tocar otra opción se cambia sola.',
    ejemplo: '«Tipo de leche» mínimo 1, máximo 1: exactamente una. «Extras» máximo 2: hasta dos cosas.',
  },
  precio: {
    titulo: 'Precio extra (+$)',
    texto: 'Se suma al precio del producto cuando eligen esa opción. En blanco o 0: la opción es gratis.',
    ejemplo: 'Chocolate $1.75 + Deslactosada (+$0.25) = $2.00.',
  },
  maximo: {
    titulo: 'Máx. de la opción',
    texto: 'Cuántas veces se puede pedir esa misma opción en un producto; al vender salen los botones − y +. Con 1 solo se marca o no.',
    ejemplo: '«Porción de leche» máx. 2: pueden pedir una o dos porciones.',
  },
  insumo: {
    titulo: 'Insumo que descuenta',
    texto: 'Lo que sale del inventario cada vez que se vende el producto con esa opción. Aunque la opción sea gratis, se descuenta y su costo cuenta en la ganancia. «No descuenta inventario»: para opciones que no gastan nada.',
    ejemplo: '«Leche entera» descuenta 250 ml de Leche entera. «Sin azúcar» no descuenta nada.',
  },
  obligatorio: {
    titulo: 'Obligatorio',
    texto: 'La opción va siempre marcada y no se puede quitar (si tiene máximo, sí se puede subir).',
    ejemplo: '«Tortillas» del desayuno: siempre van.',
  },
  unaSola: {
    titulo: 'Una sola',
    texto: 'No se combina con las demás opciones de su bloque: al elegirla se quitan todas las otras, y si después eligen otra, se quita ella. Úsala solo en opciones tipo «Sin …» o «Ninguno», en bloques donde se pueden elegir varias cosas. En un bloque con máximo 1 no hace falta.',
    ejemplo: '«Endulzante» (máximo 3): Azúcar, Miel, Canela y «Sin endulzar» como una sola. Si tocan «Sin endulzar», se quitan Azúcar y Canela.',
  },
  activa: {
    titulo: 'Activa',
    texto: 'Apagada no sale al vender, pero no se borra. Vuelve a encenderla cuando regrese.',
    ejemplo: 'Un sabor que se acabó por temporada.',
  },
} as const;
export type ClaveAyuda = keyof typeof AYUDAS;
