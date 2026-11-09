// Después de cobrar: el cambio en grande y lo que pagó el cliente. Se queda abierta hasta
// que quien cobra toca «Listo» (tocar fuera no la cierra), para no olvidar cuánto devolver
// mientras el cajón está abierto. El sistema no sabe cuándo se cierra el cajón: no tiene sensor.
import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { Boton } from '@/components/ui';
import { C } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar } from '@/lib/aviso';
import { dinero } from '@/lib/formato';
import * as op from '@/lib/operaciones';

export interface VentaCobradaDatos {
  id: number;
  numero: string;
  total: number;
  cambio: number;
  pagos?: { metodo: string | null; monto: number; recibido: number | null }[];
  nota?: string; // «MESA 1 queda libre», «El resto del pedido sigue por cobrar»
}

// reimprimir: venta guardada sin conexión, la imprime la tablet (sin servidor no hay venta que pedir)
export function VentaCobrada({ venta, cajaId, onListo, reimprimir: reimprimirLocal }: {
  venta: VentaCobradaDatos | null; cajaId: number | null; onListo: () => void; reimprimir?: () => Promise<void>;
}) {
  const [imprimiendo, setImprimiendo] = useState(false);
  if (!venta) return null;

  const reimprimir = async () => {
    if (reimprimirLocal) {
      setImprimiendo(true);
      await reimprimirLocal().catch((err) => avisar('No se pudo imprimir', mensajeError(err)));
      setImprimiendo(false);
      return;
    }
    if (!cajaId) return;
    setImprimiendo(true);
    try {
      const r = await op.imprimirVenta(venta.id, cajaId, { copia: true });
      if (!r.impreso) avisar('No se imprimió', r.message);
    } catch (err) {
      avisar('No se pudo imprimir', mensajeError(err));
    } finally {
      setImprimiendo(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onListo} supportedOrientations={['portrait', 'landscape']}>
      <View style={e.velo}>
        <View style={e.ventana}>
          <Text style={[e.registrada, !venta.id && { color: C.aviso }]}>{venta.id ? `Venta ${venta.numero} registrada` : `Venta ${venta.numero} guardada sin conexión`}</Text>
          <Text style={e.etiqueta}>Cambio</Text>
          <Text style={[e.cambio, venta.cambio <= 0 && { color: C.suave }]}>{dinero(venta.cambio)}</Text>
          <Text style={e.total}>Total {dinero(venta.total)}</Text>

          {(venta.pagos ?? []).length > 0 && (
            <View style={e.pagos}>
              {(venta.pagos ?? []).map((p, i) => (
                <View key={i} style={e.pago}>
                  <Text style={e.pagoTexto}>{p.metodo ?? 'Pago'}{p.recibido != null && p.recibido > p.monto ? ' · recibido' : ''}</Text>
                  <Text style={[e.pagoTexto, { fontWeight: '700' }]}>{dinero(p.recibido ?? p.monto)}</Text>
                </View>
              ))}
            </View>
          )}
          {venta.nota ? <Text style={e.nota}>{venta.nota}</Text> : null}

          <View style={e.botones}>
            <Boton estilo={{ flex: 1 }} titulo="Imprimir otra vez" variante="contorno" cargando={imprimiendo} onPress={reimprimir} deshabilitado={!cajaId || (!venta.id && !reimprimirLocal)} />
            <Boton estilo={{ flex: 1 }} titulo="Listo" onPress={onListo} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const e = StyleSheet.create({
  velo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  ventana: { width: '100%', maxWidth: 440, backgroundColor: '#fff', borderRadius: 18, padding: 24, gap: 8, alignItems: 'stretch' },
  registrada: { textAlign: 'center', fontSize: 13, fontWeight: '800', color: C.exito, textTransform: 'uppercase' },
  etiqueta: { textAlign: 'center', fontSize: 15, color: C.suave, marginTop: 6 },
  cambio: { textAlign: 'center', fontSize: 64, fontWeight: '800', color: C.texto },
  total: { textAlign: 'center', fontSize: 15, color: C.suave },
  pagos: { marginTop: 8, borderTopWidth: 1, borderColor: C.borde, paddingTop: 8, gap: 4 },
  pago: { flexDirection: 'row', justifyContent: 'space-between' },
  pagoTexto: { fontSize: 15, color: C.texto },
  nota: { textAlign: 'center', fontSize: 14, color: C.primario, fontWeight: '600', marginTop: 4 },
  botones: { flexDirection: 'row', gap: 10, marginTop: 14 },
});
