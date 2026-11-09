// Montos en letras para el recibo: 6.05 → "Seis dólares Con Cinco Centavos".
// Misma regla que la API (app/Support/NumeroALetras.php) y la web: la tablet la usa al imprimir sin conexión.

const UNIDADES = ['', 'Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve', 'Diez',
  'Once', 'Doce', 'Trece', 'Catorce', 'Quince', 'Dieciséis', 'Diecisiete', 'Dieciocho', 'Diecinueve', 'Veinte',
  'Veintiuno', 'Veintidós', 'Veintitrés', 'Veinticuatro', 'Veinticinco', 'Veintiséis', 'Veintisiete', 'Veintiocho', 'Veintinueve'];
const DECENAS = ['', '', '', 'Treinta', 'Cuarenta', 'Cincuenta', 'Sesenta', 'Setenta', 'Ochenta', 'Noventa'];
const CENTENAS = ['', 'Ciento', 'Doscientos', 'Trescientos', 'Cuatrocientos', 'Quinientos', 'Seiscientos', 'Setecientos', 'Ochocientos', 'Novecientos'];

// "Uno" delante de dólares o centavos se dice "Un"
const apocopar = (t: string) => t.replace(/Veintiuno$/, 'Veintiún').replace(/Uno$/, 'Un');

export const numeroEnLetras = (n: number): string => {
  if (n === 0) return 'Cero';
  if (n >= 1_000_000) {
      const m = Math.floor(n / 1_000_000), r = n % 1_000_000;
      const t = m === 1 ? 'Un Millón' : `${apocopar(numeroEnLetras(m))} Millones`;
      return r ? `${t} ${numeroEnLetras(r)}` : t;
  }
  if (n >= 1000) {
      const m = Math.floor(n / 1000), r = n % 1000;
      const t = m === 1 ? 'Mil' : `${apocopar(numeroEnLetras(m))} Mil`;
      return r ? `${t} ${numeroEnLetras(r)}` : t;
  }
  if (n >= 100) {
      if (n === 100) return 'Cien';
      const r = n % 100;
      return CENTENAS[Math.floor(n / 100)] + (r ? ` ${numeroEnLetras(r)}` : '');
  }
  if (n < 30) return UNIDADES[n];
  const u = n % 10;
  return DECENAS[Math.floor(n / 10)] + (u ? ` y ${UNIDADES[u]}` : '');
};

export const dolaresEnLetras = (monto: number): string => {
  const total = Math.round(Math.abs(monto) * 100);
  const enteros = Math.floor(total / 100);
  const centavos = total % 100;
  const parte = enteros === 0 ? 'Cero dólares' : `${apocopar(numeroEnLetras(enteros))} ${enteros === 1 ? 'dólar' : 'dólares'}`;
  return `${parte} Con ${centavos === 0 ? 'Cero' : apocopar(numeroEnLetras(centavos))} ${centavos === 1 ? 'Centavo' : 'Centavos'}`;
};
