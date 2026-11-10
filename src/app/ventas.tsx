import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Encabezado } from '@/components/encabezado';
import { FiltroFechas, rangoDe, VerMas } from '@/components/filtroFechas';
import { Etiqueta } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { dinero, fecha, hora } from '@/lib/formato';
import * as op from '@/lib/operaciones';
import { ESTADO_VENTA } from '@/lib/operaciones';
import { useListaPaginada } from '@/lib/paginado';

export default function Ventas() {
  const [rango, setRango] = useState(() => rangoDe('hoy'));
  const pedir = useCallback((page: number) => op.getVentas({ desde: rango.desde, hasta: rango.hasta, page, per_page: 50 }), [rango]);
  const { respuesta: datos, items, error, cargar, verMas, hayMas, cargandoMas } = useListaPaginada(pedir, (r) => r.ventas);
  // Con más de un día se muestra la fecha además de la hora
  const variosDias = rango.desde !== rango.hasta;

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  return (
    <SafeAreaView style={e.pantalla} edges={['top', 'left', 'right', 'bottom']}>
      <Encabezado titulo="Ventas" subtitulo={datos ? `${datos.totales.cantidad} venta(s) · ${dinero(datos.totales.total)}` : undefined} />
      <FiltroFechas valor={rango} onCambio={setRango} />
      {error ? <Text style={e.error}>{error}</Text> : null}
      <FlatList
        data={items}
        ListFooterComponent={<VerMas hayMas={hayMas} cargando={cargandoMas} onPress={verMas} />}
        keyExtractor={(v) => String(v.id)}
        contentContainerStyle={e.lista}
        ListEmptyComponent={<Text style={e.vacio}>{datos ? 'Sin ventas en este periodo' : 'Cargando...'}</Text>}
        renderItem={({ item: v }) => {
          const est = ESTADO_VENTA[v.estado];
          return (
            <Pressable onPress={() => router.push({ pathname: '/ventas/[id]', params: { id: String(v.id) } })} style={({ pressed }) => [e.venta, pressed && { opacity: 0.8 }]}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={e.numero}>{v.numero} · {variosDias ? fecha(v.fecha) : hora(v.fecha)}</Text>
                <Text style={e.suave}>{v.productos} producto(s) · {v.pagos.join(', ')} · {v.usuario}{v.cliente ? ` · ${v.cliente}` : ''}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[e.total, v.estado === 'anulada' && { textDecorationLine: 'line-through', color: C.tenue }]}>{dinero(v.total)}</Text>
                {v.estado !== 'completada' && <Etiqueta {...est} />}
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo },
  filtros: { flexDirection: 'row', gap: 8, padding: 12 },
  chip: { paddingHorizontal: 18, height: 44, justifyContent: 'center', borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: C.borde },
  chipActivo: { backgroundColor: C.texto, borderColor: C.texto },
  chipTexto: { fontWeight: '600', color: C.texto },
  error: { color: C.peligro, paddingHorizontal: 16 },
  lista: { padding: 12, gap: 8, maxWidth: 900, width: '100%', alignSelf: 'center' },
  vacio: { textAlign: 'center', color: C.suave, padding: 24 },
  venta: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 14 },
  numero: { fontSize: 16, fontWeight: '700', color: C.texto },
  suave: { fontSize: 13, color: C.suave },
  total: { fontSize: 18, fontWeight: '800', color: C.texto },
});
