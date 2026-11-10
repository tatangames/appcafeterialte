import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Encabezado } from '@/components/encabezado';
import { Boton, Cargando } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { getManuales, Manual, ModuloManual } from '@/lib/operaciones';
import { useSesion } from '@/lib/sesion';
import { sinTildes } from '@/lib/texto';

// Un color por módulo, igual que en la web
const COLORES: Record<string, string> = {
  inicio: '#334155', ventas: '#86198F', caja: '#047857', clientes: '#1D4ED8', 'compras-gastos': '#C2410C',
  inventario: '#0F766E', produccion: '#B91C1C', reportes: '#4338CA', configuracion: '#4B5563', seguridad: '#BE123C',
};
const color = (modulo: string) => COLORES[modulo] ?? '#4B5563';

const textoDe = (m: Manual) => sinTildes([
  m.titulo, m.resumen, m.donde.web, m.donde.tablet,
  ...m.secciones.flatMap((s) => [s.titulo, s.texto, ...(s.pasos ?? []), ...(s.puntos ?? [])]),
  ...(m.ejemplos ?? []).flatMap((x) => [x.titulo, ...x.pasos]),
  ...(m.preguntas ?? []).flatMap((q) => [q.p, q.r]),
].filter(Boolean).join(' '));

// Manuales de uso: tarjetas por módulo con buscador; al tocar una se abre el manual completo
export default function Manuales() {
  const { puede } = useSesion();
  const { width } = useWindowDimensions();
  const [modulos, setModulos] = useState<ModuloManual[] | null>(null);
  const [error, setError] = useState('');
  const [buscar, setBuscar] = useState('');
  const [modulo, setModulo] = useState('');
  const [soloTablet, setSoloTablet] = useState(true);
  const [abierto, setAbierto] = useState<string | null>(null);

  useEffect(() => {
    getManuales().then((r) => setModulos(r.modulos)).catch((err) => setError(mensajeError(err)));
  }, []);

  const indice = useMemo(() => new Map((modulos ?? []).flatMap((mo) => mo.manuales).map((m) => [m.id, textoDe(m)])), [modulos]);
  const todos = (modulos ?? []).flatMap((mo) => mo.manuales.map((m) => ({ ...m, modulo: mo.id })));
  const puedeUsar = (m: Manual) => !m.permisos.length || m.permisos.some(puede);

  const abrir = (id: string | null) => setAbierto(id);

  const manual = abierto ? todos.find((m) => m.id === abierto) : undefined;
  if (manual) {
    const mo = modulos!.find((x) => x.id === manual.modulo)!;
    return (
      <SafeAreaView style={e.pantalla} edges={['top', 'left', 'right', 'bottom']}>
        <Encabezado titulo={manual.titulo} subtitulo={mo.titulo} derecha={<Boton titulo="Todos los manuales" chico variante="contorno" onPress={() => abrir(null)} />} />
        <ScrollView key={manual.id} contentContainerStyle={e.contenido}>
          <Detalle manual={manual} modulo={mo.id} disponible={puedeUsar(manual)}
            relacionados={(manual.relacionados ?? []).map((r) => todos.find((t) => t.id === r)).filter((x): x is Manual & { modulo: string } => !!x)}
            onAbrir={abrir} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const palabras = sinTildes(buscar.trim()).split(/\s+/).filter(Boolean);
  const visibles = (modulos ?? [])
    .filter((mo) => !modulo || mo.id === modulo)
    .map((mo) => ({ ...mo, manuales: mo.manuales.filter((m) => (!soloTablet || !!m.donde.tablet || mo.id === 'inicio') && puedeUsar(m)
      && palabras.every((p) => indice.get(m.id)!.includes(p))) }))
    .filter((mo) => mo.manuales.length);
  const columnas = width >= 1000 ? 3 : 2;
  const ancho = (Math.min(width, 1100) - 40 - 12 * (columnas - 1)) / columnas;

  return (
    <SafeAreaView style={e.pantalla} edges={['top', 'left', 'right', 'bottom']}>
      <Encabezado titulo="Manuales" subtitulo="Paso a paso, casos de uso y preguntas frecuentes" />
      <ScrollView contentContainerStyle={e.contenido} keyboardShouldPersistTaps="handled">
        {error ? <Text style={e.error}>{error}</Text> : null}
        {!modulos && !error ? <Cargando /> : null}

        {modulos && (
          <>
            <TextInput value={buscar} onChangeText={setBuscar} placeholder="Buscar: cerrar turno, sin azúcar, merma, cobrar…"
              placeholderTextColor={C.tenue} style={e.buscador} />
            <View style={e.chips}>
              <Pressable onPress={() => setSoloTablet((v) => !v)} style={[e.chip, soloTablet && e.chipActivo]}>
                <Text style={[e.chipTexto, soloTablet && { color: '#fff' }]}>{soloTablet ? '✓ ' : ''}Solo lo de la tablet</Text>
              </Pressable>
              <Pressable onPress={() => setModulo('')} style={[e.chip, !modulo && e.chipActivo]}>
                <Text style={[e.chipTexto, !modulo && { color: '#fff' }]}>Todos</Text>
              </Pressable>
              {modulos.map((mo) => (
                <Pressable key={mo.id} onPress={() => setModulo(mo.id)} style={[e.chip, modulo === mo.id && e.chipActivo]}>
                  <Text style={[e.chipTexto, modulo === mo.id && { color: '#fff' }]}>{mo.titulo.replace(/^Módulo /, '')}</Text>
                </Pressable>
              ))}
            </View>

            {visibles.length === 0 && (
              <Text style={e.vacio}>
                Ningún manual coincide.{soloTablet ? ' Quita «Solo lo de la tablet» para ver también los de la web.' : ''}
              </Text>
            )}

            {visibles.map((mo) => (
              <View key={mo.id} style={{ gap: 10 }}>
                <View>
                  <Text style={e.modulo}>{mo.titulo.toUpperCase()}</Text>
                  <Text style={e.suave}>{mo.descripcion}</Text>
                </View>
                <View style={e.rejilla}>
                  {mo.manuales.map((m) => (
                    <Pressable key={m.id} onPress={() => abrir(m.id)}
                      style={({ pressed }) => [e.tarjeta, { width: ancho, opacity: pressed ? 0.85 : 1 }]}>
                      <View style={[e.franja, { backgroundColor: color(mo.id) }]}>
                        <Text style={e.tarjetaTitulo}>{m.titulo}</Text>
                      </View>
                      <View style={{ padding: 14, gap: 8, flex: 1 }}>
                        <Text style={e.resumen} numberOfLines={3}>{m.resumen}</Text>
                        <View style={e.etiquetas}>
                          {m.donde.tablet ? <Text style={[e.etiqueta, { backgroundColor: '#DCFCE7', color: '#166534' }]}>Tablet</Text> : null}
                          {m.donde.web ? <Text style={[e.etiqueta, { backgroundColor: '#DBEAFE', color: '#1E40AF' }]}>Web</Text> : null}
                          {(m.ejemplos?.length ?? 0) > 0 ? <Text style={[e.etiqueta, { backgroundColor: '#FEF3C7', color: '#92400E' }]}>{m.ejemplos!.length} caso(s) de uso</Text> : null}
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Detalle({ manual: m, modulo, disponible, relacionados, onAbrir }: {
  manual: Manual; modulo: string; disponible: boolean; relacionados: Manual[]; onAbrir: (id: string) => void;
}) {
  return (
    <>
      <View style={[e.portada, { backgroundColor: color(modulo) }]}>
        <Text style={e.portadaTitulo}>{m.titulo}</Text>
        <Text style={e.portadaTexto}>{m.resumen}</Text>
        {m.donde.tablet ? <Text style={e.donde}>Tablet: {m.donde.tablet}</Text> : null}
        {m.donde.web ? <Text style={e.donde}>Web: {m.donde.web}</Text> : null}
        {!disponible ? <Text style={[e.donde, { backgroundColor: 'rgba(220,38,38,0.85)' }]}>Tu rol no tiene acceso: pídeselo al administrador</Text> : null}
      </View>

      {m.secciones.map((s, i) => (
        <View key={i} style={e.seccion}>
          <Text style={e.seccionTitulo}>{s.titulo}</Text>
          {s.texto ? <Text style={e.parrafo}>{s.texto}</Text> : null}
          {s.pasos ? <Pasos pasos={s.pasos} fondo={C.primario} /> : null}
          {s.puntos?.map((p, j) => (
            <View key={j} style={e.punto}>
              <View style={e.vineta} />
              <Text style={e.parrafo}>{p}</Text>
            </View>
          ))}
        </View>
      ))}

      {(m.ejemplos ?? []).map((x, i) => (
        <View key={i} style={[e.seccion, e.ejemplo]}>
          <Text style={[e.seccionTitulo, { color: '#78350F' }]}>Caso de uso: {x.titulo}</Text>
          <Pasos pasos={x.pasos} fondo={C.aviso} />
        </View>
      ))}

      {(m.preguntas?.length ?? 0) > 0 && (
        <View style={e.seccion}>
          <Text style={e.seccionTitulo}>Preguntas frecuentes</Text>
          {m.preguntas!.map((q, i) => (
            <View key={i} style={{ gap: 4, paddingVertical: 6 }}>
              <Text style={e.pregunta}>{q.p}</Text>
              <Text style={e.parrafo}>{q.r}</Text>
            </View>
          ))}
        </View>
      )}

      {relacionados.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={e.seccionTitulo}>También te puede servir</Text>
          {relacionados.map((r) => (
            <Pressable key={r.id} onPress={() => onAbrir(r.id)} style={({ pressed }) => [e.relacionado, pressed && { opacity: 0.8 }]}>
              <Text style={e.pregunta}>{r.titulo} ›</Text>
              <Text style={e.suave}>{r.resumen}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </>
  );
}

function Pasos({ pasos, fondo }: { pasos: string[]; fondo: string }) {
  return (
    <View style={{ gap: 10 }}>
      {pasos.map((p, i) => (
        <View key={i} style={e.paso}>
          <View style={[e.numero, { backgroundColor: fondo }]}><Text style={e.numeroTexto}>{i + 1}</Text></View>
          <Text style={[e.parrafo, { flex: 1 }]}>{p}</Text>
        </View>
      ))}
    </View>
  );
}

const e = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo },
  contenido: { padding: 20, gap: 16, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  error: { color: C.peligro, fontSize: 15 },
  buscador: { height: 52, borderRadius: radio, borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#fff', paddingHorizontal: 16, fontSize: 16, color: C.texto },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: '#E5E7EB' },
  chipActivo: { backgroundColor: C.primario },
  chipTexto: { fontSize: 14, fontWeight: '600', color: '#374151' },
  vacio: { fontSize: 15, color: C.suave, textAlign: 'center', padding: 24 },
  modulo: { fontSize: 17, fontWeight: '800', color: C.texto, letterSpacing: 0.5 },
  suave: { fontSize: 13, color: C.suave },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tarjeta: { backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, overflow: 'hidden' },
  franja: { height: 78, justifyContent: 'flex-end', padding: 12 },
  tarjetaTitulo: { color: '#fff', fontSize: 17, fontWeight: '800' },
  resumen: { fontSize: 14, color: '#4B5563' },
  etiquetas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  etiqueta: { fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  portada: { borderRadius: radio, padding: 20, gap: 8 },
  portadaTitulo: { color: '#fff', fontSize: 26, fontWeight: '800' },
  portadaTexto: { color: 'rgba(255,255,255,0.92)', fontSize: 16 },
  donde: { alignSelf: 'flex-start', color: '#fff', fontSize: 14, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, overflow: 'hidden' },
  seccion: { backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 18, gap: 10 },
  ejemplo: { backgroundColor: '#FFFBEB', borderColor: '#FCD34D' },
  seccionTitulo: { fontSize: 18, fontWeight: '800', color: C.texto },
  parrafo: { fontSize: 15, color: '#374151', lineHeight: 22, flexShrink: 1 },
  punto: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  vineta: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.primario, marginTop: 8 },
  paso: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  numero: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  numeroTexto: { color: '#fff', fontWeight: '800' },
  pregunta: { fontSize: 15, fontWeight: '700', color: C.texto },
  relacionado: { backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 14, gap: 4 },
});
