// Impresión sin servidor: la tablet arma el ticket y las comandas de una venta guardada sin
// conexión (mismas plantillas que ImpresionService.php) y los manda por el Wi-Fi del local a
// la impresora. Los datos (negocio, impresoras, área de cada producto) se guardan mientras
// hay conexión con GET /impresion/offline.
import { guardarJson, leerJson } from '../almacenLocal';
import { api, mensajeError } from '../api';
import { VentaEnCola } from '../conexion';
import { enviarAImpresora, puedeImprimir } from '../impresionLocal';
import { Documento } from './documento';
import { comanda, ConfiguracionImpresion, ImpresoraOffline, ticket } from './plantillas';

export type { ConfiguracionImpresion, ImpresoraOffline } from './plantillas';

const CACHE = 'pos_cache_impresion';

/** Con conexión: guarda la configuración de impresión de esta caja para usarla sin servidor. */
export const actualizarConfiguracionImpresion = (cajaId: number) =>
  api.get<ConfiguracionImpresion>(`/impresion/offline?caja_id=${cajaId}`)
    .then((c) => guardarJson(CACHE, c))
    .catch(() => null);

const mandar = async (impresora: ImpresoraOffline, doc: Documento) => {
  if (impresora.conexion === 'windows' || !impresora.ip) {
    throw new Error(`${impresora.alias} está conectada a la computadora del servidor: sin conexión la tablet no la alcanza`);
  }
  if (impresora.cortar_papel) doc.cortar();
  else doc.avanzar(4);
  const bytes = impresora.tipo_impresion === 'star_raster' ? doc.starRaster() : doc.escPos();
  await enviarAImpresora(impresora.ip, impresora.puerto || 9100, bytes);
};

/**
 * Imprime el ticket (y abre el cajón si se pagó en efectivo) y, si se pide, las comandas de
 * cada área. Devuelve los problemas para avisarlos; nunca lanza.
 */
export async function imprimirVentaOffline(venta: VentaEnCola, opciones: { comandas?: boolean } = {}): Promise<{ impreso: boolean; errores: string[] }> {
  if (!puedeImprimir()) return { impreso: false, errores: ['Esta versión de la app no puede imprimir: instala el APK'] };
  const c = await leerJson<ConfiguracionImpresion>(CACHE);
  if (!c) return { impreso: false, errores: ['La tablet no tiene los datos de las impresoras: abre Venta rápida una vez con conexión'] };

  const errores: string[] = [];
  if (!c.ticket) {
    errores.push('No hay impresora de tickets configurada para esta caja');
  } else {
    try {
      const doc = ticket(venta, c, c.ticket);
      if (venta.resumen.efectivo && c.ticket.cash_drawer && c.ticket.cash_drawer !== 'ninguno') {
        doc.abrirCajon(c.ticket.cash_drawer === 'pin5' ? 'pin5' : 'pin2');
      }
      await mandar(c.ticket, doc);
    } catch (err) {
      errores.push(mensajeError(err, 'No se imprimió el ticket'));
    }
  }

  if (opciones.comandas) {
    // Por área de preparación; lo que no tiene área se entrega directo y solo lleva el ticket
    const porArea = new Map<number, VentaEnCola['resumen']['lineas']>();
    for (const l of venta.resumen.lineas) {
      const area = l.producto_id ? c.productos[String(l.producto_id)] : undefined;
      if (area) porArea.set(area, [...(porArea.get(area) ?? []), l]);
    }
    for (const [areaId, lineas] of porArea) {
      const area = c.areas.find((a) => a.id === areaId);
      if (!area?.impresora) continue;
      try {
        await mandar(area.impresora, comanda(venta, lineas, area.nombre, c, area.impresora));
      } catch (err) {
        errores.push(`Comanda de ${area.nombre}: ${mensajeError(err, 'no se imprimió')}`);
      }
    }
  }

  return { impreso: errores.length === 0, errores };
}
