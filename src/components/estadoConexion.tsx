// Indicador de conexión del POS en la barra superior: en línea, sin conexión con ventas
// guardadas en la tablet, sincronizando o con ventas que el servidor rechazó.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Boton, Ventana } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar } from '@/lib/aviso';
import { useConexion, VentaEnCola } from '@/lib/conexion';
import { imprimirVentaOffline } from '@/lib/impresion/offline';
import { cantidad, dinero, fecha } from '@/lib/formato';

export function EstadoConexion() {
  const { activo, enLinea, cola, sincronizando, sincronizar } = useConexion();
  const [abierto, setAbierto] = useState(false);
  const [imprimiendo, setImprimiendo] = useState<string | null>(null);
  if (!activo) return null;

  // Reimprimir el ticket de una venta que espera: lo arma e imprime la tablet
  const imprimir = async (v: VentaEnCola) => {
    setImprimiendo(v.uuid);
    try {
      const r = await imprimirVentaOffline(v);
      if (r.errores.length) avisar('No se imprimió', r.errores.join('\n'));
    } catch (err) {
      avisar('No se pudo imprimir', mensajeError(err));
    } finally {
      setImprimiendo(null);
    }
  };

  const conError = cola.filter((v) => v.estado === 'error').length;
  const pendientes = cola.length;
  // Todo en orden: solo un punto verde, para no ocupar la barra
  const enOrden = enLinea && !pendientes && !sincronizando;

  const { fondo, color, punto, texto } = sincronizando
    ? { fondo: '#DBEAFE', color: '#1E40AF', punto: C.primario, texto: 'Sincronizando…' }
    : !enLinea
      ? { fondo: '#FEF3C7', color: '#92400E', punto: C.aviso, texto: pendientes ? `Sin conexión · ${pendientes}` : 'Sin conexión' }
      : conError
        ? { fondo: '#FEE2E2', color: '#991B1B', punto: C.peligro, texto: `${conError} sin sincronizar` }
        : pendientes
          ? { fondo: '#DBEAFE', color: '#1E40AF', punto: C.primario, texto: `${pendientes} por enviar` }
          : { fondo: '#DCFCE7', color: '#166534', punto: C.exito, texto: '' };

  return (
    <>
      <Pressable onPress={() => setAbierto(true)} hitSlop={6} accessibilityLabel="Estado de la conexión"
        style={[e.chip, { backgroundColor: fondo }, enOrden && e.chipChico]}>
        <View style={[e.punto, { backgroundColor: punto }]} />
        {texto ? <Text style={[e.chipTexto, { color }]} numberOfLines={1}>{texto}</Text> : null}
      </Pressable>

      <Ventana visible={abierto} ancho={560} onCerrar={() => setAbierto(false)}
        titulo={enLinea ? 'Conectado al servidor' : 'Sin conexión con el servidor'}
        subtitulo={enLinea
          ? 'Las ventas se registran al instante.'
          : 'Puedes seguir cobrando en Venta rápida: las ventas se guardan en esta tablet y se envían solas al volver la conexión.'}
        pie={
          <>
            <Boton estilo={{ flex: 1 }} titulo="Cerrar" variante="neutro" onPress={() => setAbierto(false)} />
            <Boton estilo={{ flex: 1 }} titulo={sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'} cargando={sincronizando}
              deshabilitado={!pendientes} onPress={sincronizar} />
          </>
        }>
        <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 8 }}>
          {pendientes === 0 && <Text style={e.suave}>No hay ventas pendientes en esta tablet ✓</Text>}
          {cola.map((v) => (
            <View key={v.uuid} style={[e.venta, v.estado === 'error' && { borderColor: '#FCA5A5' }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={e.numero}>{v.resumen.numero} · {fecha(v.resumen.fecha)}</Text>
                <Text style={e.suave} numberOfLines={2}>
                  {v.resumen.lineas.map((l) => `${cantidad(l.cantidad)} × ${l.nombre}`).join(', ')}
                </Text>
                {v.estado === 'error' && <Text style={e.error}>{v.error} ({v.intentos} intento{v.intentos === 1 ? '' : 's'})</Text>}
              </View>
              <Text style={e.total}>{dinero(v.resumen.total)}</Text>
              <Boton titulo="Ticket" chico variante="contorno" cargando={imprimiendo === v.uuid} onPress={() => imprimir(v)} />
            </View>
          ))}
        </ScrollView>
      </Ventana>
    </>
  );
}

const e = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 999, maxWidth: 200 },
  chipChico: { paddingHorizontal: 10 },
  chipTexto: { fontSize: 13, fontWeight: '700' },
  punto: { width: 10, height: 10, borderRadius: 5 },
  suave: { fontSize: 13, color: C.suave },
  venta: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radio, borderWidth: 1, borderColor: C.borde },
  numero: { fontSize: 15, fontWeight: '700', color: C.texto },
  error: { fontSize: 13, color: C.peligro, fontWeight: '600' },
  total: { fontSize: 16, fontWeight: '800', color: C.texto },
});
