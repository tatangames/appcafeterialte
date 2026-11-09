import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Boton, Campo, Cargando } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar } from '@/lib/aviso';
import { cantidad, fecha } from '@/lib/formato';
import { abrirTurno, getCatalogosCaja, getTurnoActual } from '@/lib/servicios';
import { useSesion } from '@/lib/sesion';
import { Caja } from '@/lib/tipos';

type Turno = Awaited<ReturnType<typeof getTurnoActual>>;

// Caja de esta tablet y su turno. Para cobrar hace falta un turno abierto.
export default function CajaPantalla() {
  const { cajaId, fijarCaja, puede, usuario } = useSesion();
  const [cajas, setCajas] = useState<Caja[] | null>(null);
  const [turno, setTurno] = useState<Turno | null>(null);
  const [fondo, setFondo] = useState('');
  const [abriendo, setAbriendo] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const cat = await getCatalogosCaja();
      setCajas(cat.cajas);
      if (cajaId) setTurno(await getTurnoActual(cajaId));
    } catch (e) {
      avisar('No se pudo cargar la caja', mensajeError(e));
      setCajas([]);
    }
  }, [cajaId]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const elegir = async (id: number) => {
    await fijarCaja(id);
    setTurno(await getTurnoActual(id).catch(() => null));
  };

  const abrir = async () => {
    if (!cajaId) return;
    setAbriendo(true);
    try {
      await abrirTurno(cajaId, Number(fondo || 0));
      setFondo('');
      setTurno(await getTurnoActual(cajaId));
    } catch (e) {
      avisar('No se pudo abrir el turno', mensajeError(e));
    } finally {
      setAbriendo(false);
    }
  };

  if (!cajas) return <Cargando />;

  return (
    <SafeAreaView style={e.pantalla}>
      <ScrollView contentContainerStyle={e.contenido}>
        <Text style={e.titulo}>Caja de esta tablet</Text>
        <Text style={e.suave}>Las ventas que se cobren aquí entran al turno de esta caja.</Text>

        <View style={e.cajas}>
          {cajas.map((c) => (
            <Pressable key={c.id} onPress={() => elegir(c.id)}
              style={[e.caja, cajaId === c.id && { borderColor: C.primario, backgroundColor: '#EFF6FF' }]}>
              <Text style={e.cajaNombre}>{c.nombre}</Text>
              <Text style={e.suave}>{c.turno_abierto ? `Turno abierto por ${c.turno_abierto.usuario}` : 'Sin turno abierto'}</Text>
            </Pressable>
          ))}
          {cajas.length === 0 && <Text style={e.suave}>No hay cajas activas. Créalas en Ajustes › Negocio, cajas y pagos (o en la web).</Text>}
        </View>

        {cajaId && turno && (
          turno.turno ? (
            <View style={e.bloque}>
              <Text style={e.ok}>Turno abierto por {turno.turno.usuario_apertura} · {fecha(turno.turno.abierto_at)}</Text>
            </View>
          ) : (
            <View style={e.bloque}>
              <Text style={e.subtitulo}>No hay turno abierto</Text>
              {turno.turno_anterior && <Text style={e.suave}>Último cierre: {turno.turno_anterior.cerro} · {fecha(turno.turno_anterior.cerrado_at)}</Text>}

              {(turno.por_comprar?.length ?? 0) > 0 && (
                <View style={e.compras}>
                  <Text style={e.comprasTitulo}>Por comprar (quedó en su mínimo)</Text>
                  {turno.por_comprar!.map((p) => (
                    <Text key={p.producto_id} style={e.comprasLinea}>
                      {p.producto}: hay {cantidad(p.stock_actual)} {p.unidad ?? ''} · mín. {cantidad(p.stock_minimo)}
                    </Text>
                  ))}
                </View>
              )}

              {puede('caja.abrir') ? (
                <>
                  <Campo etiqueta="Fondo inicial ($)" value={fondo} onChangeText={setFondo} keyboardType="decimal-pad" placeholder="0.00" />
                  <Text style={e.suave}>El turno queda a nombre de {usuario?.nombre}. Si atiende otra persona, cierra sesión y que entre con su usuario.</Text>
                  <Boton titulo={`Abrir turno de ${usuario?.nombre ?? ''}`} variante="exito" onPress={abrir} cargando={abriendo} />
                </>
              ) : (
                <Text style={e.suave}>Pide a un cajero o encargado que abra el turno para poder cobrar. Puedes tomar órdenes igual.</Text>
              )}
            </View>
          )
        )}

        <Boton titulo="Continuar" onPress={() => router.replace('/inicio')} deshabilitado={!cajaId} />
      </ScrollView>
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo },
  contenido: { padding: 20, gap: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  titulo: { fontSize: 24, fontWeight: '700', color: C.texto },
  subtitulo: { fontSize: 18, fontWeight: '700', color: C.texto },
  suave: { color: C.suave, fontSize: 14 },
  ok: { color: C.exito, fontSize: 16, fontWeight: '600' },
  cajas: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  caja: { flexGrow: 1, minWidth: 200, padding: 16, borderRadius: radio, borderWidth: 2, borderColor: C.borde, backgroundColor: '#fff', gap: 4 },
  cajaNombre: { fontSize: 18, fontWeight: '700', color: C.texto },
  bloque: { backgroundColor: '#fff', borderRadius: radio, padding: 16, gap: 12, borderWidth: 1, borderColor: C.borde },
  compras: { backgroundColor: C.marcaClaro, borderRadius: radio, padding: 12, gap: 4 },
  comprasTitulo: { fontWeight: '700', color: C.marca },
  comprasLinea: { color: '#78350F', fontSize: 14 },
});
