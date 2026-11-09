// Venta de mostrador armada en la tablet cuando no hay servidor: mismo cálculo que el servidor
// (precio con extras, descuento general redondeado), número provisional y cambio.
import { VentaEnCola } from './conexion';
import { leer, guardar } from './storage';
import { AjusteNuevo, MetodoPago } from './tipos';

const CLAVE_SECUENCIA = 'pos_secuencia_offline';
const redondear = (v: number) => Math.round(v * 100) / 100;

// TAB-<caja>-000001: secuencia propia de la tablet; no choca con los números del servidor
// ni con los OFF-<caja>-… del POS web
export const siguienteNumeroProvisional = async (cajaId: number): Promise<string> => {
  let siguiente: number;
  try {
    siguiente = Number((await leer(CLAVE_SECUENCIA)) || 0) + 1;
    await guardar(CLAVE_SECUENCIA, String(siguiente));
  } catch {
    siguiente = Date.now() % 1_000_000;
  }
  return `TAB-${cajaId}-${String(siguiente).padStart(6, '0')}`;
};

export interface LineaOffline {
  producto_id: number; nombre: string; unidad: string | null; cantidad: number; precio: number;
  modificadores: number[]; extras: string[]; ajustes: AjusteNuevo[]; textoAjustes: string[]; notas?: string;
}

interface Datos {
  uuid: string;
  cajaId: number;
  turnoId: number | null;
  usuario: string | null;
  lineas: LineaOffline[];
  descuento: number | null;          // % sobre la venta
  pagos: { metodo_pago_id: number; monto: number; referencia?: string }[];
  metodos: MetodoPago[];
  clienteId: number | null;
  clienteNombre: string | null;
}

export const construirVentaOffline = async (d: Datos): Promise<VentaEnCola> => {
  const numero = await siguienteNumeroProvisional(d.cajaId);
  const ahora = new Date();

  const subtotal = redondear(d.lineas.reduce((t, l) => t + redondear(l.precio * l.cantidad), 0));
  const total = d.descuento ? redondear(subtotal - redondear(subtotal * d.descuento) / 100) : subtotal;

  // Mismo reparto que el servidor: lo que no es efectivo primero, el resto en efectivo con cambio
  const efectivo = (id: number) => !!d.metodos.find((m) => m.id === id)?.afecta_efectivo;
  const recibido = redondear(d.pagos.filter((p) => efectivo(p.metodo_pago_id)).reduce((t, p) => t + p.monto, 0));
  const otros = redondear(d.pagos.filter((p) => !efectivo(p.metodo_pago_id)).reduce((t, p) => t + p.monto, 0));
  const cambio = recibido > 0 ? redondear(Math.max(recibido - Math.max(total - otros, 0), 0)) : 0;

  // «Efectivo», «Efectivo y Tarjeta»: como la condición de la operación del recibo
  const nombres = [...new Set(d.pagos.map((p) => d.metodos.find((m) => m.id === p.metodo_pago_id)?.nombre).filter((n): n is string => !!n))];
  const condicion = nombres.length ? nombres.join(', ').replace(/, ([^,]*)$/, ' y $1') : 'Efectivo';
  const referencias = d.pagos.filter((p) => p.referencia)
    .map((p) => `${d.metodos.find((m) => m.id === p.metodo_pago_id)?.nombre ?? 'Pago'} ref. ${p.referencia}`);

  const dos = (n: number) => String(n).padStart(2, '0');
  const fecha = `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())} ${dos(ahora.getHours())}:${dos(ahora.getMinutes())}`;

  return {
    uuid: d.uuid,
    creado: ahora.toISOString(),
    estado: 'pendiente',
    intentos: 0,
    payload: {
      uuid: d.uuid,
      caja_id: d.cajaId,
      turno_id: d.turnoId,
      numero_provisional: numero,
      fecha_venta: ahora.toISOString(),
      items: d.lineas.map((l) => ({
        producto_id: l.producto_id,
        cantidad: l.cantidad,
        precio_unitario: l.precio,
        ...(l.modificadores.length ? { modificadores: l.modificadores } : {}),
        ...(l.ajustes.length ? { ajustes: l.ajustes } : {}),
        ...(l.notas ? { notas: l.notas } : {}),
      })),
      descuento_global: d.descuento ? { tipo: 'porcentaje', valor: d.descuento } : null,
      pagos: d.pagos.map((p) => ({ metodo_pago_id: p.metodo_pago_id, monto: p.monto, ...(p.referencia ? { referencia: p.referencia } : {}) })),
      cliente_id: d.clienteId,
    },
    resumen: {
      numero, fecha, total, cambio, usuario: d.usuario,
      subtotal, descuento: redondear(subtotal - total), cliente: d.clienteNombre, condicion, referencias, efectivo: recibido > 0,
      lineas: d.lineas.map((l) => ({
        producto_id: l.producto_id, nombre: l.nombre, unidad: l.unidad, cantidad: l.cantidad, precio: l.precio,
        extras: [...l.extras, ...l.textoAjustes, ...(l.notas ? [l.notas] : [])],
      })),
    },
  };
};
