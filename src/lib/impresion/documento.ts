// Documento de impresión armado en la tablet (cuando no hay servidor). Es el mismo modelo que
// EscPos.php del servidor: se guardan las órdenes (alinear, negrita, texto…) y al final se
// convierten a ESC/POS (Epson, Xprinter, 3nStar…) o a imagen raster para las Star TSP100,
// que no tienen fuentes (igual que StarRaster.php).
import { CARACTERES, TAMANOS, TamanoFuente } from './fuente';

type Orden =
  | { t: 'alinear'; n: 0 | 1 | 2 }
  | { t: 'negrita'; v: boolean }
  | { t: 'grande'; alto: boolean; ancho: boolean }
  | { t: 'normal' }
  | { t: 'texto'; s: string }
  | { t: 'avanzar'; n: number }
  | { t: 'cortar' }
  | { t: 'cajon'; pin: 'pin2' | 'pin5' };

// Caracteres que la impresora no tiene se cambian por uno parecido (como EscPos::codificar)
const REEMPLAZOS: Record<string, string> = { '“': '"', '”': '"', '‘': "'", '’': "'", '–': '-', '—': '-', '…': '...', '−': '-', '•': '*', '€': 'EUR', '\r': '' };
const limpiar = (s: string) => s.replace(/[“”‘’–—…−•€\r]/g, (c) => REEMPLAZOS[c] ?? c);

/** Texto partido en renglones de `ancho` sin cortar palabras salvo las más largas (wordwrap de PHP). */
export const partir = (texto: string, ancho: number): string[] => {
  const salida: string[] = [];
  for (const renglon of limpiar(texto).split('\n')) {
    let actual = '';
    for (const palabra of renglon.split(' ')) {
      let resto = palabra;
      while (resto.length > ancho) {
        if (actual) { salida.push(actual); actual = ''; }
        salida.push(resto.slice(0, ancho));
        resto = resto.slice(ancho);
      }
      if (!actual) actual = resto;
      else if (actual.length + 1 + resto.length <= ancho) actual += ` ${resto}`;
      else { salida.push(actual); actual = resto; }
    }
    salida.push(actual);
  }
  return salida;
};

export const rellenar = (texto: string, ancho: number) => texto + ' '.repeat(Math.max(ancho - texto.length, 0));
export const izquierda = (texto: string, ancho: number) => ' '.repeat(Math.max(ancho - texto.length, 0)) + texto;

export class Documento {
  private ordenes: Orden[] = [];

  constructor(readonly ancho = 48) {}

  alinear(a: 'izquierda' | 'centro' | 'derecha') { this.ordenes.push({ t: 'alinear', n: a === 'centro' ? 1 : a === 'derecha' ? 2 : 0 }); return this; }
  negrita(v = true) { this.ordenes.push({ t: 'negrita', v }); return this; }
  grande(alto = true, ancho = true) { this.ordenes.push({ t: 'grande', alto, ancho }); return this; }
  normal() { this.ordenes.push({ t: 'normal' }); return this; }
  linea(texto = '') { this.ordenes.push({ t: 'texto', s: `${limpiar(texto)}\n` }); return this; }
  parrafo(texto: string, ancho = this.ancho) { partir(texto, ancho).forEach((l) => this.linea(l)); return this; }
  separador(c = '-') { return this.linea(c.repeat(this.ancho)); }
  avanzar(n = 1) { this.ordenes.push({ t: 'avanzar', n: Math.max(0, Math.min(n, 255)) }); return this; }
  cortar() { this.avanzar(3); this.ordenes.push({ t: 'cortar' }); return this; }
  abrirCajon(pin: 'pin2' | 'pin5' = 'pin2') { this.ordenes.push({ t: 'cajon', pin }); return this; }

  /** Bytes ESC/POS con la página de códigos CP850. */
  escPos(): Uint8Array {
    const b: number[] = [0x1b, 0x40, 0x1b, 0x74, 0x02];
    for (const o of this.ordenes) {
      switch (o.t) {
        case 'alinear': b.push(0x1b, 0x61, o.n); break;
        case 'negrita': b.push(0x1b, 0x45, o.v ? 1 : 0); break;
        case 'grande': b.push(0x1d, 0x21, (o.ancho ? 0x20 : 0) | (o.alto ? 0x10 : 0)); break;
        case 'normal': b.push(0x1d, 0x21, 0, 0x1b, 0x45, 0); break;
        case 'texto': for (const c of o.s) b.push(cp850(c)); break;
        case 'avanzar': b.push(0x1b, 0x64, o.n); break;
        case 'cortar': b.push(0x1d, 0x56, 0x42, 0x00); break;
        case 'cajon': b.push(0x1b, 0x70, o.pin === 'pin5' ? 1 : 0, 0x19, 0xfa); break;
      }
    }
    return Uint8Array.from(b);
  }

  /** Star Graphic Mode: cada renglón dibujado con la fuente de puntos (como StarRaster.php). */
  starRaster(): Uint8Array {
    const puntos = this.ancho >= 42 ? 576 : 384;
    const celda = puntos / this.ancho;
    const altoLinea = Math.round(celda * 2);
    const porFila = puntos / 8;

    // Renglones con el formato activo al terminar cada uno
    type Renglon = { texto: string; alto: number; alinear: number; negrita: boolean; dobleAncho: number; dobleAlto: number };
    const renglones: Renglon[] = [];
    let estado = { alinear: 0, negrita: false, dobleAncho: 1, dobleAlto: 1 };
    let texto = '';
    let cortar = false;
    let cajon: 'pin2' | 'pin5' | null = null;
    for (const o of this.ordenes) {
      if (o.t === 'alinear') estado = { ...estado, alinear: o.n };
      else if (o.t === 'negrita') estado = { ...estado, negrita: o.v };
      else if (o.t === 'grande') estado = { ...estado, dobleAncho: o.ancho ? 2 : 1, dobleAlto: o.alto ? 2 : 1 };
      else if (o.t === 'normal') estado = { ...estado, negrita: false, dobleAncho: 1, dobleAlto: 1 };
      else if (o.t === 'avanzar') for (let k = 0; k < o.n; k++) renglones.push({ texto: '', alto: altoLinea, ...estado });
      else if (o.t === 'cortar') cortar = true;
      else if (o.t === 'cajon') cajon = o.pin;
      else {
        for (const c of o.s) {
          if (c === '\n') {
            renglones.push({ texto, alto: altoLinea * estado.dobleAlto, ...estado });
            texto = '';
          } else texto += c;
        }
      }
    }
    if (texto) renglones.push({ texto, alto: altoLinea * estado.dobleAlto, ...estado });
    // El avance antes del corte sobra: la impresora avanza sola hasta la cuchilla
    while (renglones.length && !renglones[renglones.length - 1].texto.trim()) renglones.pop();

    const alto = Math.max(1, renglones.reduce((t, r) => t + r.alto, 0) + 24);
    const imagen = new Uint8Array(alto * porFila);
    const punto = (x: number, y: number) => {
      if (x >= 0 && x < puntos && y >= 0 && y < alto) imagen[y * porFila + (x >> 3)] |= 0x80 >> (x & 7);
    };

    // La fuente de este tamaño de celda (si no hay, la más parecida escalada)
    const tamano = TAMANOS.reduce((a, b) => (Math.abs(b.celda - celda) < Math.abs(a.celda - celda) ? b : a));
    const escalaX = tamano.celda / celda;
    const escalaY = tamano.alto / altoLinea;

    let y0 = 0;
    for (const r of renglones) {
      if (r.texto) {
        // 1) El renglón a tamaño normal: cada letra en su celda, como imagettftext en el servidor
        const anchoNormal = Math.ceil(r.texto.length * celda);
        const normal = new Uint8Array(anchoNormal * altoLinea);
        const fuente = glifos(tamano, r.negrita);
        for (let k = 0; k < r.texto.length; k++) {
          const xLetra = Math.round(k * celda);
          for (let y = 0; y < altoLinea; y++) {
            const gy = Math.min(tamano.alto - 1, Math.floor(y * escalaY));
            for (let x = 0; x < Math.ceil(celda) + 2; x++) {
              const gx = Math.floor(x * escalaX);
              if (gx >= tamano.ancho || xLetra + x >= anchoNormal) continue;
              if (encendido(fuente, tamano, r.texto[k], gx, gy)) normal[y * anchoNormal + xLetra + x] = 1;
            }
          }
        }
        // 2) Doble ancho / doble alto y alineación (imagecopyresampled en el servidor)
        const anchoFinal = Math.min(anchoNormal * r.dobleAncho, puntos);
        const anchoFuente = Math.round(anchoFinal / r.dobleAncho); // lo que cabe del renglón normal
        const x0 = r.alinear === 1 ? Math.floor((puntos - anchoFinal) / 2) : r.alinear === 2 ? puntos - anchoFinal : 0;
        for (let dy = 0; dy < altoLinea * r.dobleAlto; dy++) {
          const sy = Math.floor(dy / r.dobleAlto);
          for (let dx = 0; dx < anchoFinal; dx++) {
            const sx = Math.floor((dx * anchoFuente) / anchoFinal);
            if (normal[sy * anchoNormal + sx]) punto(x0 + dx, y0 + dy);
          }
        }
      }
      y0 += r.alto;
    }

    const salida: number[] = [];
    const ascii = (s: string) => { for (const c of s) salida.push(c.charCodeAt(0)); };
    ascii('\x1b@\x1b*rR\x1b*rA\x1b*rP0\x00');
    if (!cortar) ascii('\x1b*rE1\x00');
    for (let y = 0; y < alto; y++) {
      salida.push(0x62, porFila & 0xff, porFila >> 8);
      for (let b = 0; b < porFila; b++) salida.push(imagen[y * porFila + b]);
    }
    ascii('\x1b\x0c\x00\x1b*rB');
    if (cajon) salida.push(cajon === 'pin5' ? 0x1a : 0x07);
    return Uint8Array.from(salida);
  }
}

// ── Fuente de puntos ──────────────────────────────────────────

const decodificadas = new Map<string, Uint8Array>();
const glifos = (t: TamanoFuente, negrita: boolean): Uint8Array => {
  const clave = `${t.celda}-${negrita}`;
  let datos = decodificadas.get(clave);
  if (!datos) {
    datos = desdeBase64(negrita ? t.negrita : t.normal);
    decodificadas.set(clave, datos);
  }
  return datos;
};
const INDICE = new Map([...CARACTERES].map((c, i) => [c, i]));

// Cada carácter ocupa ancho x alto bits seguidos (redondeado al byte, como lo empaca fuente.php)
const encendido = (fuente: Uint8Array, t: TamanoFuente, c: string, x: number, y: number): boolean => {
  const i = INDICE.get(c) ?? INDICE.get('?')!;
  const porGlifo = Math.ceil((t.ancho * t.alto) / 8);
  const bit = y * t.ancho + x;
  return (fuente[i * porGlifo + (bit >> 3)] & (0x80 >> (bit & 7))) !== 0;
};

// ── CP850 y base64 ────────────────────────────────────────────

const CP850: Record<string, number> = {
  'á': 0xa0, 'é': 0x82, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3, 'Á': 0xb5, 'É': 0x90, 'Í': 0xd6, 'Ó': 0xe0, 'Ú': 0xe9,
  'ñ': 0xa4, 'Ñ': 0xa5, 'ü': 0x81, 'Ü': 0x9a, '¿': 0xa8, '¡': 0xad, '°': 0xf8, 'º': 0xa7, 'ª': 0xa6, '·': 0xfa,
  '«': 0xae, '»': 0xaf, 'ç': 0x87, 'Ç': 0x80,
};
const cp850 = (c: string): number => {
  const n = c.charCodeAt(0);
  return n < 128 ? n : CP850[c] ?? 0x3f;
};

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export const aBase64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    s += ALFABETO[(n >> 18) & 63] + ALFABETO[(n >> 12) & 63]
      + (i + 1 < bytes.length ? ALFABETO[(n >> 6) & 63] : '=')
      + (i + 2 < bytes.length ? ALFABETO[n & 63] : '=');
  }
  return s;
};

function desdeBase64(s: string): Uint8Array {
  const limpio = s.replace(/=+$/, '');
  const salida = new Uint8Array(Math.floor((limpio.length * 3) / 4));
  let j = 0;
  for (let i = 0; i < limpio.length; i += 4) {
    const n = (ALFABETO.indexOf(limpio[i]) << 18) | (ALFABETO.indexOf(limpio[i + 1]) << 12)
      | ((ALFABETO.indexOf(limpio[i + 2] ?? 'A') & 63) << 6) | (ALFABETO.indexOf(limpio[i + 3] ?? 'A') & 63);
    if (j < salida.length) salida[j++] = (n >> 16) & 0xff;
    if (j < salida.length) salida[j++] = (n >> 8) & 0xff;
    if (j < salida.length) salida[j++] = n & 0xff;
  }
  return salida;
}
