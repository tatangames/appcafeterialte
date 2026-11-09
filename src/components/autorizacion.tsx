// Ventana global "Autorización del administrador": se abre sola cuando una acción la pide
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Boton, Campo, Teclado, Ventana } from '@/components/ui';
import { C } from '@/constants/colores';
import { registrarVentanaAutorizacion, SolicitudAutorizacion } from '@/lib/autorizacion';

/**
 * Anular una comanda, cancelar lo que ya se envió o dar más descuento del
 * permitido: el administrador escribe su PIN (o su contraseña) en esta tablet
 * sin darle su contraseña al mesero, y la acción se completa.
 */
export function AutorizacionGlobal() {
  const [solicitud, setSolicitud] = useState<SolicitudAutorizacion | null>(null);
  const [codigo, setCodigo] = useState('');
  const [conContrasena, setConContrasena] = useState(false);
  const resolver = useRef<((v: string | null) => void) | null>(null);

  useEffect(() => {
    registrarVentanaAutorizacion((s) => new Promise((resolve) => {
      resolver.current?.(null);
      resolver.current = resolve;
      setCodigo('');
      setSolicitud(s);
    }));
    return () => registrarVentanaAutorizacion(null);
  }, []);

  const cerrar = (valor: string | null) => {
    resolver.current?.(valor);
    resolver.current = null;
    setSolicitud(null);
    setCodigo('');
  };

  const tecla = (t: string) => setCodigo((c) => (t === '⌫' ? c.slice(0, -1) : c.length < 6 ? c + t : c));

  return (
    <Ventana visible={!!solicitud} titulo="Autorización del administrador" subtitulo={solicitud?.mensaje} onCerrar={() => cerrar(null)} ancho={420}
      pie={
        <>
          <Boton estilo={{ flex: 1 }} titulo="Cancelar" variante="contorno" onPress={() => cerrar(null)} />
          <Boton estilo={{ flex: 1 }} titulo="Autorizar" onPress={() => cerrar(codigo.trim())} deshabilitado={!codigo.trim()} />
        </>
      }>
      {solicitud?.invalido && <Text style={e.error}>El PIN o la contraseña no sirvió. Inténtalo de nuevo.</Text>}
      {conContrasena ? (
        <Campo etiqueta="Contraseña del administrador" value={codigo} onChangeText={setCodigo} secureTextEntry autoFocus autoCapitalize="none" />
      ) : (
        <>
          <View style={e.puntos}>
            {Array.from({ length: Math.max(4, codigo.length) }).map((_, i) => (
              <View key={i} style={[e.punto, i < codigo.length && e.puntoLleno]} />
            ))}
          </View>
          <Teclado onTecla={tecla} />
        </>
      )}
      <Pressable onPress={() => { setConContrasena((v) => !v); setCodigo(''); }} hitSlop={8}>
        <Text style={e.enlace}>{conContrasena ? 'Usar PIN' : 'Usar contraseña en lugar del PIN'}</Text>
      </Pressable>
    </Ventana>
  );
}

const e = StyleSheet.create({
  error: { color: C.peligro, fontWeight: '600' },
  puntos: { flexDirection: 'row', justifyContent: 'center', gap: 14, paddingVertical: 8 },
  punto: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: C.borde },
  puntoLleno: { backgroundColor: C.texto, borderColor: C.texto },
  enlace: { color: C.primario, fontWeight: '600', textAlign: 'center' },
});
