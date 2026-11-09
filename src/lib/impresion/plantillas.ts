// Plantillas del ticket y la comanda que la tablet imprime sin servidor: las mismas que
// ImpresionService.php (ticket() y comanda()), con el número provisional de la venta.
import type { VentaEnCola } from '../conexion';
import { Documento, izquierda, partir, rellenar } from './documento';
import { dolaresEnLetras } from './numeroALetras';

export interface ImpresoraOffline {
  id: number; alias: string; conexion: 'red' | 'windows' | 'dispositivo' | string; ip: string | null; puerto: number;
  tipo_impresion: 'escpos' | 'star_raster' | string; ancho_caracteres: number; cortar_papel: boolean; cash_drawer: string | null;
}

export interface ConfiguracionImpresion {
  negocio: {
    nombre: string | null; razon_social: string | null; direccion: string | null; nit: string; nrc: string;
    actividad_economica: string | null; tipo_establecimiento: string | null; telefono: string | null; mensaje_ticket: string | null;
  };
  ticket: ImpresoraOffline | null;
  areas: { id: number; nombre: string; impresora: ImpresoraOffline | null }[];
  productos: Record<string, number>; // producto_id → área
}

const COLUMNAS_TICKET_STAR = 42;
const numero = (v: number) => v.toFixed(2);
const cantidadComanda = (v: number) => String(Math.round(v * 1000) / 1000);
const dos = (n: number) => String(n).padStart(2, '0');
// "2026-11-07 20:33" → "07-11-2026 20:33"
const fechaTicket = (f: string) => f.replace(/^(\d{4})-(\d{2})-(\d{2})/, '$3-$2-$1');

// Ticket de la venta: el mismo recibo que imprime el servidor, con el número provisional
export function ticket(venta: VentaEnCola, c: ConfiguracionImpresion, impresora: ImpresoraOffline): Documento {
  const n = c.negocio;
  const r = venta.resumen;
  // Star: el ticket de cobro va a 42 columnas (letra más grande), igual que anchoTicket() del servidor
  const columnas = impresora.ancho_caracteres || 48;
  const ancho = impresora.tipo_impresion === 'star_raster' && columnas > COLUMNAS_TICKET_STAR ? COLUMNAS_TICKET_STAR : columnas;
  const doc = new Documento(ancho);

  doc.alinear('centro').negrita().grande(true, false).parrafo(n.razon_social || n.nombre || 'Panadería Eduardo').normal();
  if (n.direccion) doc.parrafo(n.direccion);
  if (n.razon_social && n.nombre) doc.parrafo(n.nombre);
  if (n.nit) doc.negrita().linea(`NIT: ${n.nit}`).normal();
  if (n.nrc) doc.negrita().linea(`NRC: ${n.nrc}`).normal();
  doc.parrafo(`Actividad económica:${n.actividad_economica ? ` ${n.actividad_economica}` : ''}`)
    .linea('Tipo de establecimiento:')
    .parrafo(n.tipo_establecimiento || 'Sucursal / Agencia');
  if (n.telefono) doc.linea(`Tel: ${n.telefono}`);

  doc.avanzar().separador('=').avanzar()
    .negrita().linea('Recibo').normal()
    .parrafo('Emitido sin conexión. El número definitivo se asigna al sincronizar.')
    .linea('Fecha y hora de generación:')
    .negrita().linea(fechaTicket(r.fecha)).normal()
    .alinear('izquierda');

  doc.avanzar().separador('=').avanzar()
    .alinear('centro').negrita().grande(true, false).linea('Datos del receptor').normal()
    .alinear('izquierda')
    .parrafo(`Nombre: ${r.cliente || 'Consumidor Final'}`)
    .parrafo('Dirección: Ciudad')
    .linea(`No. de Venta: ${r.numero}`);

  // Cant | Descripción | Precio | Total, con los extras debajo («* Leche»)
  const cCant = 6;
  const cNum = ancho >= 42 ? 8 : 7;
  const cDesc = ancho - cCant - cNum * 2;
  const fila = (cant: string, desc: string, precio: string, total: string) =>
    rellenar(cant.slice(0, cCant), cCant) + rellenar(desc.slice(0, cDesc), cDesc)
    + izquierda(precio.slice(0, cNum), cNum) + izquierda(total.slice(0, cNum), cNum);

  doc.avanzar().separador('=').avanzar()
    .negrita().linea(fila('Cant', 'Descripción', 'Precio', 'Total')).normal();
  for (const l of r.lineas) {
    const partes = partir(l.nombre, Math.max(cDesc - 1, 8));
    doc.linea(fila(numero(l.cantidad), partes.shift() ?? '', numero(l.precio), numero(l.cantidad * l.precio)));
    partes.forEach((resto) => doc.linea(' '.repeat(cCant) + resto));
    for (const extra of l.extras) {
      const renglones = partir(extra, Math.max(cDesc - 3, 8));
      doc.linea(`${' '.repeat(cCant)}* ${renglones.shift() ?? ''}`);
      renglones.forEach((resto) => doc.linea(' '.repeat(cCant + 2) + resto));
    }
  }

  doc.alinear('derecha');
  if ((r.descuento ?? 0) > 0) {
    doc.linea(`Subtotal: $ ${numero(r.subtotal ?? r.total)}`).linea(`Descuento: -$ ${numero(r.descuento ?? 0)}`);
  }
  doc.negrita().linea(`Total: $ ${numero(r.total)}`).normal();

  doc.alinear('izquierda')
    .linea('Total en letras:')
    .parrafo(dolaresEnLetras(r.total))
    .parrafo(`Condición de la operación: ${r.condicion ?? 'Efectivo'}`);
  (r.referencias ?? []).forEach((ref) => doc.parrafo(ref));

  doc.avanzar().separador('=').avanzar().alinear('centro')
    .parrafo(n.mensaje_ticket || 'Muchas gracias por su compra.');
  return doc;
}

// Comanda (solicitud de producción) del área, sin precios: igual que ImpresionService::comanda
export function comanda(venta: VentaEnCola, lineas: VentaEnCola['resumen']['lineas'], area: string, c: ConfiguracionImpresion, impresora: ImpresoraOffline): Documento {
  const ancho = impresora.ancho_caracteres || 48;
  const doc = new Documento(ancho);
  const cCant = 8;
  const cDesc = ancho - cCant;
  const alto = () => doc.negrita().grande(true, false);
  const ahora = new Date();
  // Partir sin cortar palabras (como envolver() del servidor)
  const envolver = (texto: string, a: number) => {
    const salida = [''];
    for (const palabra of texto.trim().split(/\s+/)) {
      const actual = salida[salida.length - 1];
      const junto = actual ? `${actual} ${palabra}` : palabra;
      if (junto.length <= a || !actual) salida[salida.length - 1] = junto;
      else salida.push(palabra);
    }
    return salida;
  };

  doc.alinear('centro');
  doc.negrita().grande(true, false).linea(`#${venta.resumen.numero}`);
  doc.negrita().grande(true, false).parrafo((c.negocio.nombre || 'Panadería Eduardo').toUpperCase(), ancho);
  alto().linea('Solicitud de producción');
  doc.avanzar().negrita().grande().linea(`** ${area.toUpperCase()} **`);
  alto();
  doc.alinear('izquierda').avanzar().parrafo('Mostrador', ancho)
    .parrafo('Sin conexión', ancho)
    .avanzar().linea(`${dos(ahora.getDate())}-${dos(ahora.getMonth() + 1)}-${ahora.getFullYear()}`)
    .alinear('derecha').linea(`${dos(ahora.getHours())}:${dos(ahora.getMinutes())}`).alinear('izquierda')
    .normal().separador('=');
  alto();
  if (venta.resumen.cliente) doc.avanzar().alinear('centro').linea(venta.resumen.cliente).alinear('izquierda');
  doc.avanzar().linea(`${rellenar('CANT', cCant)}DESCRIPCIÓN`);

  for (const l of lineas) {
    const unidad = l.unidad && l.unidad !== 'u' ? ` ${l.unidad}` : '';
    envolver(l.nombre, cDesc).forEach((texto, i) => doc.linea(rellenar(i === 0 ? cantidadComanda(l.cantidad) + unidad : '', cCant) + texto));
    for (const nota of l.extras) {
      envolver(nota, cDesc - 2).forEach((texto, i) => doc.linea(' '.repeat(cCant) + (i === 0 ? '* ' : '  ') + texto));
    }
  }
  doc.avanzar().alinear('centro').linea('ORIGINAL').normal().alinear('izquierda');
  return doc;
}
