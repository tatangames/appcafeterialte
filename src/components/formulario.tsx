// Piezas de formulario táctiles: opciones en botones y renglones con interruptor
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { C, radio } from '@/constants/colores';

/** Una o varias opciones como botones grandes (clase, unidad, categorías...). */
export function Opciones<T extends string | number>({ opciones, valor, onCambiar, multiple }: {
  opciones: { valor: T; texto: string }[];
  valor: T | T[] | null;
  onCambiar: (v: T) => void;
  multiple?: boolean;
}) {
  const activo = (v: T) => (multiple ? (valor as T[]).includes(v) : valor === v);
  return (
    <View style={e.chips}>
      {opciones.map((o) => (
        <Pressable key={String(o.valor)} onPress={() => onCambiar(o.valor)} style={[e.chip, activo(o.valor) && e.chipActivo]}>
          <Text style={[e.chipTexto, activo(o.valor) && { color: '#fff' }]}>{multiple && activo(o.valor) ? '✓ ' : ''}{o.texto}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Explicación larga: párrafos y ejemplos con título. */
export type Ayuda = ({ texto: string } | { ejemplo: string; lineas: string[] })[];

/** Renglón con título, explicación y un interruptor; con `ayuda` muestra un botón «?» que despliega ejemplos. */
export function Interruptor({ titulo, detalle, valor, onCambiar, deshabilitado, ayuda }: {
  titulo: string; detalle?: string; valor: boolean; onCambiar: (v: boolean) => void; deshabilitado?: boolean; ayuda?: Ayuda;
}) {
  const [verAyuda, setVerAyuda] = useState(false);
  return (
    <View style={[e.renglon, e.renglonColumna, deshabilitado && { opacity: 0.5 }]}>
      <Pressable onPress={() => !deshabilitado && onCambiar(!valor)} style={e.fila}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={e.fila}>
            <Text style={e.titulo}>{titulo}</Text>
            {ayuda ? (
              <Pressable onPress={() => setVerAyuda((v) => !v)} hitSlop={10} accessibilityLabel={`Qué hace: ${titulo}`}
                style={[e.ayudaBoton, verAyuda && e.ayudaBotonActivo]}>
                <Text style={[e.ayudaSigno, verAyuda && { color: '#fff' }]}>?</Text>
              </Pressable>
            ) : null}
          </View>
          {detalle ? <Text style={e.detalle}>{detalle}</Text> : null}
        </View>
        <Switch value={valor} onValueChange={onCambiar} disabled={deshabilitado} trackColor={{ true: C.exito, false: '#D1D5DB' }} thumbColor="#fff" />
      </Pressable>
      {ayuda && verAyuda ? (
        <View style={e.ayudaCaja}>
          {ayuda.map((b, i) => ('texto' in b ? (
            <Text key={i} style={e.ayudaTexto}>{b.texto}</Text>
          ) : (
            <View key={i} style={e.ejemplo}>
              <Text style={[e.ayudaTexto, { fontWeight: '700' }]}>{b.ejemplo}</Text>
              {b.lineas.map((l, j) => <Text key={j} style={e.ayudaTexto}>{l}</Text>)}
            </View>
          )))}
        </View>
      ) : null}
    </View>
  );
}

export function Seccion({ titulo }: { titulo: string }) {
  return <Text style={e.seccion}>{titulo}</Text>;
}

const e = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: C.borde },
  chipActivo: { backgroundColor: C.texto, borderColor: C.texto },
  chipTexto: { fontWeight: '600', color: C.texto },
  renglon: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radio, borderWidth: 1, borderColor: C.borde, backgroundColor: '#fff' },
  titulo: { fontSize: 15, fontWeight: '700', color: C.texto },
  detalle: { fontSize: 13, color: C.suave },
  seccion: { fontSize: 15, fontWeight: '800', color: C.texto, marginTop: 6 },
  renglonColumna: { flexDirection: 'column', alignItems: 'stretch' },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ayudaBoton: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  ayudaBotonActivo: { backgroundColor: C.primario, borderColor: C.primario },
  ayudaSigno: { fontSize: 12, fontWeight: '800', color: C.suave },
  ayudaCaja: { marginTop: 10, gap: 8, backgroundColor: '#EFF6FF', borderRadius: 8, padding: 10 },
  ayudaTexto: { fontSize: 13, lineHeight: 19, color: '#1E3A8A' },
  ejemplo: { gap: 4, backgroundColor: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#DBEAFE', padding: 8 },
});
