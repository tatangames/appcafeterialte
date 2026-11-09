import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Boton, Cargando } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { ApiError, mensajeError } from '@/lib/api';
import { dinero, transcurrido } from '@/lib/formato';
import { getMapa } from '@/lib/servicios';
import { useSesion } from '@/lib/sesion';
import { TerminalMapa } from '@/lib/tipos';

// Mapa de mesas: cian libre, rosa ocupada. Se actualiza solo cada 15 segundos.
export default function Mesas() {
  const { usuario } = useSesion();
  const { width } = useWindowDimensions();
  const [terminales, setTerminales] = useState<TerminalMapa[] | null>(null);
  const [zona, setZona] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [refrescando, setRefrescando] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());

  const cargar = useCallback(async () => {
    try {
      // La caja de mostrador es la venta rápida; aquí van las mesas
      setTerminales((await getMapa()).filter((t) => t.tipo !== 'caja'));
      setError('');
    } catch (e) {
      setError(mensajeError(e));
      if (e instanceof ApiError && e.estado === 401) router.replace('/login');
    }
  }, []);

  useFocusEffect(useCallback(() => {
    cargar();
    const id = setInterval(cargar, 15000);
    return () => clearInterval(id);
  }, [cargar]));

  // El tiempo de cada mesa corre en vivo
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const zonas = useMemo(() => [...new Set((terminales ?? []).map((t) => t.zona).filter(Boolean))] as string[], [terminales]);
  const visibles = (terminales ?? []).filter((t) => !zona || t.zona === zona);
  const ocupadas = (terminales ?? []).filter((t) => t.orden);
  const columnas = width >= 1100 ? 4 : width >= 760 ? 3 : 2;
  // Ancho fijo por mesa: la última fila no se estira
  const anchoMesa = (width - 32 - 12 * (columnas - 1)) / columnas;

  if (!terminales && !error) return <Cargando />;

  return (
    <SafeAreaView style={e.pantalla} edges={['top', 'left', 'right']}>
      <View style={e.cabecera}>
        <View style={{ flex: 1 }}>
          <Text style={e.titulo}>Mesas</Text>
          <Text style={e.suave}>{usuario?.nombre} · {ocupadas.length} ocupada(s)</Text>
        </View>
        <Boton titulo="‹ Menú" variante="contorno" chico onPress={() => (router.canGoBack() ? router.back() : router.replace('/inicio'))} />
      </View>

      {zonas.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={e.zonas}>
          {[null, ...zonas].map((z) => (
            <Pressable key={z ?? 'todas'} onPress={() => setZona(z)} style={[e.chip, zona === z && e.chipActivo]}>
              <Text style={[e.chipTexto, zona === z && { color: '#fff' }]}>{z ?? 'Todas'}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {error ? <Text style={e.error}>{error}</Text> : null}

      <FlatList
        key={columnas}
        data={visibles}
        numColumns={columnas}
        keyExtractor={(t) => String(t.id)}
        contentContainerStyle={e.lista}
        columnWrapperStyle={{ gap: 12 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={async () => { setRefrescando(true); await cargar(); setRefrescando(false); }} />}
        renderItem={({ item: t }) => {
          const o = t.orden;
          return (
            <Pressable onPress={() => router.push({ pathname: '/mesa/[id]', params: { id: String(t.id) } })}
              style={({ pressed }) => [e.mesa, { width: anchoMesa, borderColor: o ? C.ocupada : C.libre, opacity: pressed ? 0.85 : 1 }]}>
              <View style={[e.franja, { backgroundColor: o ? C.ocupada : C.libre }]}>
                <Text style={e.mesaNombre}>{t.nombre}</Text>
                <Text style={e.mesaEstado}>{o ? transcurrido(o.abierta_at, ahora) : 'Libre'}</Text>
              </View>
              <View style={e.mesaCuerpo}>
                {o ? (
                  <>
                    <Text style={e.monto}>{dinero(o.por_cobrar)}</Text>
                    <Text style={e.suave}>{o.usuario ?? ''}</Text>
                    {o.tickets.length > 1 && <Text style={e.suave}>{o.tickets.length} cuentas</Text>}
                    {o.por_enviar > 0 && <Text style={e.porEnviar}>{o.por_enviar} por enviar</Text>}
                  </>
                ) : (
                  <Text style={e.suave}>{t.zona ?? ''} · {t.capacidad} personas</Text>
                )}
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
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: C.borde },
  titulo: { fontSize: 22, fontWeight: '700', color: C.texto },
  suave: { color: C.suave, fontSize: 13 },
  zonas: { gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  chip: { paddingHorizontal: 16, height: 40, justifyContent: 'center', borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: C.borde },
  chipActivo: { backgroundColor: C.texto, borderColor: C.texto },
  chipTexto: { fontWeight: '600', color: C.texto },
  error: { color: C.peligro, paddingHorizontal: 16, paddingTop: 8 },
  lista: { padding: 16, gap: 12 },
  mesa: { backgroundColor: '#fff', borderRadius: radio, borderWidth: 2, overflow: 'hidden', minHeight: 130 },
  franja: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  mesaNombre: { color: '#fff', fontSize: 17, fontWeight: '800' },
  mesaEstado: { color: '#fff', fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  mesaCuerpo: { padding: 12, gap: 2 },
  monto: { fontSize: 22, fontWeight: '800', color: C.texto },
  porEnviar: { marginTop: 4, color: C.aviso, fontWeight: '700', fontSize: 13 },
});
