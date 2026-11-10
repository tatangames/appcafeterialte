import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Encabezado } from '@/components/encabezado';
import { FiltroFechas, rangoDe, VerMas } from '@/components/filtroFechas';
import { Boton, Etiqueta } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar } from '@/lib/aviso';
import { dinero, fecha } from '@/lib/formato';
import * as op from '@/lib/operaciones';
import { useListaPaginada } from '@/lib/paginado';
import { useSesion } from '@/lib/sesion';

// Turnos cerrados con quién abrió y cerró, lo esperado, lo contado y la diferencia; se reimprime el cierre
export default function Cierres() {
  const { cajaId } = useSesion();
  const [rango, setRango] = useState(() => rangoDe('7'));
  const pedir = useCallback((page: number) => op.getHistorialTurnos({ desde: rango.desde, hasta: rango.hasta, page, per_page: 50 }), [rango]);
  const { respuesta: datos, items, error, cargar, verMas, hayMas, cargandoMas } = useListaPaginada(pedir, (r) => r.turnos);
  useEffect(() => { cargar(); }, [cargar]);

  const reimprimir = async (t: op.TurnoLista) => {
    if (!cajaId) return avisar('Elige la caja de esta tablet');
    try {
      const r = await op.imprimirCierre(t.id, cajaId);
      avisar(r.impreso ? 'Cierre impreso' : 'No se imprimió', r.impreso ? undefined : r.message);
    } catch (err) {
      avisar('No se pudo imprimir', mensajeError(err));
    }
  };

  return (
    <SafeAreaView style={e.pantalla} edges={['top', 'left', 'right', 'bottom']}>
      <Encabezado titulo="Historial de cierres" subtitulo={datos ? `${datos.totales.turnos} turno(s) · ventas ${dinero(datos.totales.ventas)}` : undefined} />
      <FiltroFechas valor={rango} onCambio={setRango} />
      <View style={e.barra}>
        {datos && (
          <Text style={e.suave}>
            Faltantes <Text style={{ color: C.peligro, fontWeight: '700' }}>{dinero(datos.totales.faltantes)}</Text> · sobrantes <Text style={{ color: C.exito, fontWeight: '700' }}>{dinero(datos.totales.sobrantes)}</Text>
          </Text>
        )}
      </View>
      {error ? <Text style={e.error}>{error}</Text> : null}
      <FlatList
        data={items}
        ListFooterComponent={<VerMas hayMas={hayMas} cargando={cargandoMas} onPress={verMas} />}
        keyExtractor={(t) => String(t.id)}
        contentContainerStyle={e.lista}
        ListEmptyComponent={<Text style={e.vacio}>{datos ? 'No hay turnos en este periodo.' : 'Cargando...'}</Text>}
        renderItem={({ item: t }) => {
          const dif = t.diferencia ?? 0;
          return (
            <View style={e.tarjeta}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={e.titulo}>{t.caja} · turno #{t.id}</Text>
                <Text style={e.suave}>Abrió {t.usuario_apertura} · {fecha(t.abierto_at)}</Text>
                {t.estado === 'cerrado'
                  ? <Text style={e.suave}>Cerró {t.usuario_cierre} · {fecha(t.cerrado_at)}</Text>
                  : <Etiqueta texto="Abierto" fondo="#DCFCE7" color="#166534" />}
                <Text style={e.suave}>Fondo {dinero(t.fondo_inicial)} · ventas {dinero(t.total_ventas)} · ingresos {dinero(t.total_ingresos)} · egresos {dinero(t.total_egresos)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                {t.estado === 'cerrado' && (
                  <>
                    <Text style={e.suave}>Esperado {dinero(t.efectivo_esperado)} · contado {dinero(t.efectivo_contado)}</Text>
                    {Math.abs(dif) < 0.005 ? <Etiqueta texto="Cuadra" fondo="#DCFCE7" color="#166534" />
                      : <Etiqueta texto={dif < 0 ? `Faltante ${dinero(-dif)}` : `Sobrante ${dinero(dif)}`} fondo={dif < 0 ? '#FEE2E2' : '#DBEAFE'} color={dif < 0 ? '#B91C1C' : '#1E40AF'} />}
                    <Boton titulo="Reimprimir" chico variante="contorno" onPress={() => reimprimir(t)} />
                  </>
                )}
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo },
  barra: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: 12, paddingBottom: 0, maxWidth: 900, width: '100%', alignSelf: 'center' },
  chip: { paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: C.borde },
  chipActivo: { backgroundColor: C.texto, borderColor: C.texto },
  chipTexto: { fontWeight: '600', color: C.texto },
  error: { color: C.peligro, padding: 16 },
  lista: { padding: 12, gap: 8, maxWidth: 900, width: '100%', alignSelf: 'center' },
  vacio: { textAlign: 'center', color: C.suave, padding: 24 },
  tarjeta: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 14 },
  titulo: { fontSize: 16, fontWeight: '700', color: C.texto },
  suave: { fontSize: 13, color: C.suave },
});
