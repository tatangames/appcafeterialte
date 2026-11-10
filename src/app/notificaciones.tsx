import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Encabezado } from '@/components/encabezado';
import { Boton, Etiqueta } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar, confirmar } from '@/lib/aviso';
import * as op from '@/lib/operaciones';

type Estado = '' | 'no_leidas' | 'leidas';
const FILTROS: [Estado, string][] = [['', 'Todas'], ['no_leidas', 'Sin ver'], ['leidas', 'Vistas']];

// Avisos de stock del usuario: verlos, marcarlos como vistos y borrarlos.
// Solo se avisa una vez por producto: si sigue bajo no se repite hasta que se reponga y vuelva a bajar
export default function Notificaciones() {
  const [estado, setEstado] = useState<Estado>('');
  const [lista, setLista] = useState<op.Notificacion[] | null>(null);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [noLeidas, setNoLeidas] = useState(0);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  // Carga la primera página (o la siguiente, sumándola a la lista)
  const cargar = useCallback((page = 1) => {
    op.getNotificaciones({ estado, page })
      .then((r) => {
        setLista((antes) => (page === 1 ? r.notificaciones : [...(antes ?? []), ...r.notificaciones]));
        setPagina(r.pagina);
        setTotalPaginas(r.total_paginas);
        setNoLeidas(r.no_leidas);
        setError('');
      })
      .catch((err) => setError(mensajeError(err)));
  }, [estado]);

  useFocusEffect(useCallback(() => { cargar(1); }, [cargar]));

  const ejecutar = async (accion: () => Promise<unknown>) => {
    setOcupado(true);
    try {
      await accion();
      cargar(1);
    } catch (err) {
      avisar('No se pudo completar', mensajeError(err));
    } finally {
      setOcupado(false);
    }
  };

  const vaciar = async (soloVistas: boolean) => {
    const ok = await confirmar(
      soloVistas ? 'Borrar vistas' : 'Borrar todas',
      soloVistas ? '¿Borrar todas las notificaciones que ya viste?' : '¿Borrar TODAS tus notificaciones?',
      'Borrar',
    );
    if (ok) ejecutar(() => op.vaciarNotificaciones(soloVistas));
  };

  const abrir = (n: op.Notificacion) => {
    if (!n.leida) op.marcarNotificacion(n.id).catch(() => null);
    if (n.producto_id) router.push('/inventario');
  };

  return (
    <SafeAreaView style={e.pantalla} edges={['top', 'left', 'right', 'bottom']}>
      <Encabezado
        titulo="Notificaciones"
        subtitulo={noLeidas > 0 ? `${noLeidas} sin ver` : 'Estás al día'}
        derecha={<Boton titulo="Marcar todas vistas" chico deshabilitado={noLeidas === 0 || ocupado}
          onPress={() => ejecutar(op.leerTodasNotificaciones)} />}
      />

      <View style={e.filtros}>
        <View style={e.chips}>
          {FILTROS.map(([v, t]) => (
            <Pressable key={v} onPress={() => { setEstado(v); setLista(null); }} style={[e.chip, estado === v && e.chipActivo]}>
              <Text style={[e.chipTexto, estado === v && { color: '#fff' }]}>
                {t}{v === 'no_leidas' && noLeidas > 0 ? ` (${noLeidas})` : ''}
              </Text>
            </Pressable>
          ))}
          <View style={{ flex: 1 }} />
          <Boton titulo="Borrar vistas" variante="contorno" chico deshabilitado={ocupado} onPress={() => vaciar(true)} />
          <Boton titulo="Borrar todas" variante="peligro" chico deshabilitado={ocupado} onPress={() => vaciar(false)} />
        </View>
      </View>

      {error ? <Text style={e.error}>{error}</Text> : null}

      <FlatList
        data={lista ?? []}
        keyExtractor={(n) => String(n.id)}
        contentContainerStyle={e.lista}
        onEndReachedThreshold={0.4}
        onEndReached={() => { if (lista && pagina < totalPaginas) cargar(pagina + 1); }}
        ListEmptyComponent={<Text style={e.vacio}>
          {!lista ? 'Cargando...' : estado === 'no_leidas' ? 'Estás al día, no hay nada sin ver' : 'No hay notificaciones'}
        </Text>}
        renderItem={({ item: n }) => (
          <View style={[e.fila, !n.leida && e.filaNueva]}>
            <View style={[e.punto, { backgroundColor: n.leida ? '#D1D5DB' : n.tipo === 'stock_negativo' ? C.peligro : C.aviso }]} />
            <Pressable onPress={() => abrir(n)} style={({ pressed }) => [{ flex: 1, gap: 3 }, pressed && { opacity: 0.6 }]}>
              <Text style={[e.titulo, n.leida && { fontWeight: '500', color: '#374151' }]}>{n.titulo}</Text>
              {n.mensaje ? <Text style={e.suave}>{n.mensaje}</Text> : null}
              <View style={e.meta}>
                <Text style={e.tenue}>{op.haceCuanto(n.fecha)}</Text>
                {n.sigue_en_alerta === true && <Etiqueta texto="Sigue bajo" fondo="#FEF3C7" color="#92400E" />}
                {n.sigue_en_alerta === false && <Etiqueta texto="Ya repuesto" fondo="#DCFCE7" color="#166534" />}
              </View>
            </Pressable>
            <View style={e.acciones}>
              <Boton titulo={n.leida ? 'Sin ver' : 'Vista'} variante="contorno" chico deshabilitado={ocupado}
                onPress={() => ejecutar(() => op.marcarNotificacion(n.id, !n.leida))} />
              <Boton titulo="Borrar" variante="neutro" chico deshabilitado={ocupado}
                onPress={() => ejecutar(() => op.borrarNotificacion(n.id))} />
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo },
  filtros: { padding: 12, maxWidth: 900, width: '100%', alignSelf: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  chip: { paddingHorizontal: 16, height: 44, justifyContent: 'center', borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: C.borde },
  chipActivo: { backgroundColor: C.texto, borderColor: C.texto },
  chipTexto: { fontWeight: '600', color: C.texto },
  error: { color: C.peligro, paddingHorizontal: 16 },
  lista: { padding: 12, paddingTop: 0, gap: 8, maxWidth: 900, width: '100%', alignSelf: 'center' },
  vacio: { textAlign: 'center', color: C.suave, padding: 24 },
  fila: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 14 },
  filaNueva: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  punto: { width: 12, height: 12, borderRadius: 6, alignSelf: 'flex-start', marginTop: 5 },
  titulo: { fontSize: 16, fontWeight: '700', color: C.texto },
  suave: { fontSize: 14, color: C.suave },
  tenue: { fontSize: 12, color: C.tenue },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  acciones: { flexDirection: 'row', gap: 6 },
});
