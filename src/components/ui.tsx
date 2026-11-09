// Piezas de interfaz pensadas para el tacto (botones de al menos 48 px)
import { ReactNode } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleProp, StyleSheet,
  Text, TextInput, TextInputProps, View, ViewStyle,
} from 'react-native';

import { C, radio } from '@/constants/colores';

type Variante = 'primario' | 'exito' | 'peligro' | 'neutro' | 'contorno';

const VARIANTES: Record<Variante, { fondo: string; texto: string; borde?: string }> = {
  primario: { fondo: C.primario, texto: '#fff' },
  exito: { fondo: C.exito, texto: '#fff' },
  peligro: { fondo: C.peligro, texto: '#fff' },
  neutro: { fondo: '#E5E7EB', texto: C.texto },
  contorno: { fondo: '#fff', texto: C.texto, borde: '#D1D5DB' },
};

export function Boton({ titulo, onPress, variante = 'primario', deshabilitado, cargando, estilo, chico }: {
  titulo: string; onPress: () => void; variante?: Variante; deshabilitado?: boolean; cargando?: boolean;
  estilo?: StyleProp<ViewStyle>; chico?: boolean;
}) {
  const v = VARIANTES[variante];
  const inactivo = deshabilitado || cargando;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactivo}
      accessibilityRole="button"
      style={({ pressed }) => [
        s.boton,
        chico && s.botonChico,
        { backgroundColor: v.fondo, borderColor: v.borde ?? v.fondo, opacity: inactivo ? 0.45 : pressed ? 0.8 : 1 },
        estilo,
      ]}>
      {cargando
        ? <ActivityIndicator color={v.texto} />
        : <Text style={[s.botonTexto, chico && s.botonTextoChico, { color: v.texto }]}>{titulo}</Text>}
    </Pressable>
  );
}

export function Campo({ etiqueta, ...props }: TextInputProps & { etiqueta?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {etiqueta && <Text style={s.etiqueta}>{etiqueta}</Text>}
      <TextInput placeholderTextColor={C.tenue} {...props} style={[s.campo, props.style]} />
    </View>
  );
}

/** Ventana centrada sobre la pantalla. */
export function Ventana({ visible, titulo, subtitulo, onCerrar, children, ancho = 520, pie }: {
  visible: boolean; titulo: string; subtitulo?: string; onCerrar: () => void; children: ReactNode; ancho?: number; pie?: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar} supportedOrientations={['portrait', 'landscape']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.velo}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCerrar} accessibilityLabel="Cerrar" />
        <View style={[s.ventana, { maxWidth: ancho }]}>
          <View style={s.ventanaCabecera}>
            <View style={{ flex: 1 }}>
              <Text style={s.ventanaTitulo}>{titulo}</Text>
              {subtitulo && <Text style={s.suave}>{subtitulo}</Text>}
            </View>
            <Pressable onPress={onCerrar} hitSlop={12} accessibilityLabel="Cerrar"><Text style={s.cerrar}>✕</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {pie && <View style={s.ventanaPie}>{pie}</View>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Teclado numérico táctil (montos, cantidades). */
export function Teclado({ onTecla, conPunto }: { onTecla: (t: string) => void; conPunto?: boolean }) {
  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', conPunto ? '.' : '', '0', '⌫'];
  return (
    <View style={s.teclado}>
      {teclas.map((t, i) => (
        <Pressable key={i} disabled={!t} onPress={() => onTecla(t)}
          style={({ pressed }) => [s.tecla, !t && { opacity: 0 }, pressed && { backgroundColor: '#E5E7EB' }]}>
          <Text style={s.teclaTexto}>{t}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Etiqueta({ texto, fondo, color }: { texto: string; fondo: string; color: string }) {
  return <Text style={[s.etiquetaEstado, { backgroundColor: fondo, color }]}>{texto}</Text>;
}

export function Cargando() {
  return <View style={s.centro}><ActivityIndicator size="large" color={C.primario} /></View>;
}

export const s = StyleSheet.create({
  boton: { minHeight: 52, borderRadius: radio, borderWidth: 1, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  botonChico: { minHeight: 44, paddingHorizontal: 12 },
  botonTexto: { fontSize: 16, fontWeight: '700' },
  botonTextoChico: { fontSize: 14, fontWeight: '600' },
  etiqueta: { fontSize: 14, fontWeight: '600', color: '#374151' },
  campo: { minHeight: 50, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: radio, paddingHorizontal: 14, fontSize: 16, color: C.texto, backgroundColor: '#fff' },
  velo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  ventana: { width: '100%', maxHeight: '92%', backgroundColor: '#fff', borderRadius: 18, padding: 20, gap: 14 },
  ventanaCabecera: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  ventanaTitulo: { fontSize: 20, fontWeight: '700', color: C.texto },
  ventanaPie: { flexDirection: 'row', gap: 10 },
  cerrar: { fontSize: 22, color: C.suave, padding: 4 },
  suave: { color: C.suave, fontSize: 14 },
  error: { color: C.peligro, fontSize: 14, textAlign: 'center' },
  teclado: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  tecla: { width: '30%', height: 60, borderRadius: radio, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: C.borde, alignItems: 'center', justifyContent: 'center' },
  teclaTexto: { fontSize: 24, fontWeight: '600', color: C.texto },
  etiquetaEstado: { fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', alignSelf: 'flex-start' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
