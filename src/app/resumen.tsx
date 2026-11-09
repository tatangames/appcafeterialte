import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Encabezado } from '@/components/encabezado';
import { Boton, Cargando } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar } from '@/lib/aviso';
import { cantidad, dinero, fecha } from '@/lib/formato';
import * as op from '@/lib/operaciones';

// Resumen del día: ventas, por hora, lo más vendido y alertas
export default function Resumen() {
  const { width } = useWindowDimensions();
  const [panel, setPanel] = useState<op.Panel | null>(null);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setPanel(await op.getPanel());
    } catch (err) {
      avisar('No se pudo cargar el resumen', mensajeError(err));
    }
  }, []);
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  if (!panel) return <Cargando />;

  const v = panel.ventas;
  const columnas = width >= 900 ? 4 : 2;
  const ancho = (Math.min(width, 1100) - 32 - 10 * (columnas - 1)) / columnas;
  const maxHora = Math.max(1, ...panel.por_hora.map((h) => h.total));

  return (
    <SafeAreaView style={e.pantalla} edges={['top', 'left', 'right']}>
      <Encabezado titulo="Resumen del día" subtitulo={fecha(panel.fecha)} />
      <ScrollView contentContainerStyle={e.contenido}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={async () => { setRefrescando(true); await cargar(); setRefrescando(false); }} />}>
        <View style={e.tarjetas}>
          <View style={[e.tarjeta, { width: ancho }]}>
            <Text style={e.suave}>Ventas de hoy</Text>
            <Text style={[e.valor, { color: C.primario }]}>{dinero(v.hoy)}</Text>
            {v.variacion !== null && <Text style={{ color: v.variacion >= 0 ? C.exito : C.peligro }}>{v.variacion >= 0 ? '▲' : '▼'} {Math.abs(v.variacion)}% vs ayer ({dinero(v.ayer)})</Text>}
          </View>
          <View style={[e.tarjeta, { width: ancho }]}><Text style={e.suave}>Tickets</Text><Text style={e.valor}>{v.tickets}</Text></View>
          <View style={[e.tarjeta, { width: ancho }]}><Text style={e.suave}>Ticket promedio</Text><Text style={e.valor}>{dinero(v.ticket_promedio)}</Text></View>
          <View style={[e.tarjeta, { width: ancho }]}>
            <Text style={e.suave}>Productos en su mínimo</Text>
            <Text style={[e.valor, panel.alertas.stock_bajo > 0 && { color: C.aviso }]}>{panel.alertas.stock_bajo}</Text>
          </View>
        </View>

        {(panel.alertas.pedidos_hoy > 0 || panel.alertas.pedidos_atrasados > 0) && (
          <View style={[e.bloque, { borderColor: '#FCD34D', backgroundColor: '#FFFBEB' }]}>
            <Text style={e.subtitulo}>Pedidos especiales</Text>
            <Text style={e.texto}>{panel.alertas.pedidos_hoy} para entregar hoy · {panel.alertas.pedidos_atrasados} atrasado(s)</Text>
          </View>
        )}

        <View style={[e.columnas, width >= 900 && { flexDirection: 'row' }]}>
          <View style={[e.bloque, { flex: 1 }]}>
            <Text style={e.subtitulo}>Ventas por hora</Text>
            {panel.por_hora.length === 0 && <Text style={e.suave}>Sin ventas todavía</Text>}
            {panel.por_hora.map((h) => (
              <View key={h.hora} style={e.hora}>
                <Text style={e.horaTexto}>{String(h.hora).padStart(2, '0')}:00</Text>
                <View style={e.barraFondo}><View style={[e.barra, { width: `${(h.total / maxHora) * 100}%` }]} /></View>
                <Text style={e.horaMonto}>{dinero(h.total)}</Text>
              </View>
            ))}
          </View>

          <View style={[e.bloque, { flex: 1 }]}>
            <Text style={e.subtitulo}>Lo más vendido hoy</Text>
            {panel.top_productos.length === 0 && <Text style={e.suave}>Sin ventas todavía</Text>}
            {panel.top_productos.map((p, i) => (
              <View key={i} style={e.fila}>
                <Text style={[e.texto, { flex: 1 }]}>{p.producto}</Text>
                <Text style={e.suave}>{cantidad(p.cantidad)} {p.unidad ?? ''}</Text>
                <Text style={[e.texto, { minWidth: 70, textAlign: 'right' }]}>{dinero(p.total)}</Text>
              </View>
            ))}
          </View>
        </View>

        {panel.alertas.stock_bajo > 0 && <Boton titulo="Ver lo que falta en inventario" variante="contorno" onPress={() => router.push('/inventario')} />}
        <Text style={e.pie}>Reportes por periodo, utilidad y exportación a Excel o PDF: en la web, menú Reportes.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo },
  contenido: { padding: 16, gap: 14, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  tarjetas: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tarjeta: { backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 14, gap: 4 },
  valor: { fontSize: 26, fontWeight: '800', color: C.texto },
  suave: { fontSize: 13, color: C.suave },
  texto: { fontSize: 15, color: C.texto },
  subtitulo: { fontSize: 17, fontWeight: '700', color: C.texto },
  columnas: { gap: 14 },
  bloque: { backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 14, gap: 8 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  hora: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  horaTexto: { width: 48, fontSize: 13, color: C.suave },
  barraFondo: { flex: 1, height: 14, borderRadius: 7, backgroundColor: '#F3F4F6', overflow: 'hidden' },
  barra: { height: '100%', backgroundColor: C.primario, borderRadius: 7 },
  horaMonto: { width: 72, textAlign: 'right', fontSize: 13, color: C.texto },
  pie: { fontSize: 13, color: C.tenue, textAlign: 'center' },
});
