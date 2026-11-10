import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Encabezado } from '@/components/encabezado';
import { Boton, Campo, Cargando, Etiqueta, Ventana } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar } from '@/lib/aviso';
import { cantidad, dinero, fecha, nuevoUuid } from '@/lib/formato';
import { getCatalogosCaja } from '@/lib/servicios';
import { MetodoPago } from '@/lib/tipos';
import * as op from '@/lib/operaciones';
import { useSesion } from '@/lib/sesion';
import { ESTADO_VENTA } from '@/lib/operaciones';

// Detalle de una venta: reimprimir el ticket, anularla (solo del turno abierto) o devolver productos (de cualquier día)
export default function VentaDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { cajaId } = useSesion();
  const [venta, setVenta] = useState<op.VentaDetalle | null>(null);
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [devolviendo, setDevolviendo] = useState(false);

  const cargar = useCallback(() => {
    op.getVenta(Number(id)).then(setVenta).catch((err) => avisar('No se pudo cargar la venta', mensajeError(err)));
  }, [id]);
  useEffect(cargar, [cargar]);

  if (!venta) return <Cargando />;

  const reimprimir = async () => {
    if (!cajaId) return;
    try {
      const r = await op.imprimirVenta(venta.id, cajaId, { copia: true });
      avisar(r.impreso ? 'Ticket impreso' : 'No se imprimió', r.impreso ? undefined : r.message);
    } catch (err) {
      avisar('No se pudo imprimir', mensajeError(err));
    }
  };

  const anular = async () => {
    setOcupado(true);
    try {
      const r = await op.anularVenta(venta.id, motivo.trim());
      setAnulando(false);
      setMotivo('');
      avisar(r.message);
      cargar();
    } catch (err) {
      avisar('No se pudo anular', mensajeError(err));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <SafeAreaView style={e.pantalla} edges={['top', 'left', 'right', 'bottom']}>
      <Encabezado titulo={`Venta ${venta.numero}`} subtitulo={`${fecha(venta.fecha)} · ${venta.usuario ?? ''} · ${venta.caja ?? ''}`} />
      <ScrollView contentContainerStyle={e.contenido}>
        <View style={e.bloque}>
          <View style={e.linea}>
            <Etiqueta {...ESTADO_VENTA[venta.estado]} />
            {venta.cliente && <Text style={e.suave}>Cliente: {venta.cliente.nombre}</Text>}
          </View>
          {venta.detalles.map((d) => (
            <View key={d.id} style={e.linea}>
              <Text style={[e.texto, { flex: 1 }]}>{cantidad(d.cantidad)} × {d.nombre}</Text>
              <Text style={e.texto}>{dinero(d.subtotal)}</Text>
            </View>
          ))}
          <View style={e.separador} />
          {venta.descuento_total > 0 && <View style={e.linea}><Text style={e.suave}>Descuento</Text><Text style={e.suave}>−{dinero(venta.descuento_total)}</Text></View>}
          <View style={e.linea}><Text style={e.totalTexto}>Total</Text><Text style={e.totalTexto}>{dinero(venta.total)}</Text></View>
          {venta.pagos.map((p, i) => (
            <View key={i} style={e.linea}>
              <Text style={e.suave}>{p.metodo}{p.recibido ? ` · recibido ${dinero(p.recibido)}` : ''}{p.referencia ? ` · ${p.referencia}` : ''}</Text>
              <Text style={e.suave}>{dinero(p.monto)}{p.cambio > 0 ? ` · cambio ${dinero(p.cambio)}` : ''}</Text>
            </View>
          ))}
          {venta.estado === 'anulada' && <Text style={{ color: C.peligro }}>Anulada por {venta.anulada_por}: {venta.motivo_anulacion}</Text>}
          {(venta.devoluciones ?? []).map((d) => (
            <Text key={d.id} style={{ color: '#92400E' }}>Devolución {d.numero} · {dinero(d.total)} · {d.metodo ?? ''} · {fecha(d.fecha)}: {d.motivo}</Text>
          ))}
        </View>

        <View style={e.acciones}>
          <Boton estilo={{ flex: 1 }} titulo="Reimprimir ticket" variante="contorno" onPress={reimprimir} />
          {venta.estado === 'completada' && venta.detalles.some((d) => d.disponible > 0) && (
            <Boton estilo={{ flex: 1 }} titulo="Devolver productos" variante="contorno" onPress={() => setDevolviendo(true)} />
          )}
          {venta.estado === 'completada' && <Boton estilo={{ flex: 1 }} titulo="Anular venta" variante="peligro" onPress={() => setAnulando(true)} />}
        </View>
        <Text style={e.suave}>Anular deshace una venta del turno abierto (un cobro equivocado). Devolver registra que el cliente regresó algo, aunque sea de otro día: el dinero sale del turno abierto.</Text>
      </ScrollView>

      <Devolucion visible={devolviendo} venta={venta} onCerrar={() => setDevolviendo(false)} onListo={() => { setDevolviendo(false); cargar(); }} />

      <Ventana visible={anulando} titulo="Anular venta" subtitulo={`${venta.numero} · ${dinero(venta.total)}. Devuelve el inventario y saca el dinero de la caja.`}
        onCerrar={() => setAnulando(false)} ancho={480}
        pie={<Boton estilo={{ flex: 1 }} titulo="Anular" variante="peligro" cargando={ocupado} deshabilitado={motivo.trim().length < 3} onPress={anular} />}>
        <Campo etiqueta="Motivo" value={motivo} onChangeText={setMotivo} placeholder="Cobro equivocado..." />
      </Ventana>
    </SafeAreaView>
  );
}

function Devolucion({ visible, ...props }: { visible: boolean; venta: op.VentaDetalle; onCerrar: () => void; onListo: () => void }) {
  return visible ? <FormDevolucion {...props} /> : null;
}

// Se elige cuánto vuelve de cada producto y si regresa al inventario (buen estado) o no (dañado)
function FormDevolucion({ venta, onCerrar, onListo }: { venta: op.VentaDetalle; onCerrar: () => void; onListo: () => void }) {
  const { cajaId } = useSesion();
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [danados, setDanados] = useState<Record<number, boolean>>({});
  const [motivo, setMotivo] = useState('');
  const [metodos, setMetodos] = useState<MetodoPago[]>([]);
  const [metodoId, setMetodoId] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [uuid] = useState(nuevoUuid);

  // «Descontar de su cuenta» solo en ventas al crédito que todavía deben algo
  const aCuenta = !!venta.credito && venta.credito.saldo > 0;
  useEffect(() => {
    getCatalogosCaja().then((c) => {
      const l = c.metodos_pago.filter((m) => m.tipo !== 'credito' || aCuenta);
      setMetodos(l);
      setMetodoId((aCuenta ? l.find((m) => m.tipo === 'credito') : l.find((m) => m.afecta_efectivo))?.id ?? l[0]?.id ?? null);
    }).catch(() => null);
  }, [aCuenta]);

  const lineas = venta.detalles.filter((d) => d.disponible > 0);
  const elegidas = lineas.filter((d) => (cantidades[d.id] ?? 0) > 0);
  // Aproximado: el servidor reparte el descuento general entre las líneas
  const estimado = elegidas.reduce((t, d) => t + (d.subtotal / d.cantidad) * cantidades[d.id], 0);
  const cambiar = (d: op.VentaDetalle['detalles'][number], paso: number) =>
    setCantidades((c) => ({ ...c, [d.id]: Math.min(d.disponible, Math.max(0, Math.round(((c[d.id] ?? 0) + paso) * 1000) / 1000)) }));

  const devolver = async () => {
    if (!cajaId) return avisar('Elige la caja de esta tablet');
    setGuardando(true);
    try {
      const r = await op.devolverVenta(venta.id, {
        uuid, caja_id: cajaId, motivo: motivo.trim(), metodo_pago_id: metodoId ?? undefined,
        items: elegidas.map((d) => ({ venta_detalle_id: d.id, cantidad: cantidades[d.id], reingresa_inventario: !danados[d.id] })),
      });
      avisar(r.message);
      onListo();
    } catch (err) {
      avisar('No se pudo registrar la devolución', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Ventana visible titulo={`Devolución de ${venta.numero}`} subtitulo="Pide autorización de un encargado. El reembolso sale del turno abierto." onCerrar={onCerrar} ancho={620}
      pie={<Boton estilo={{ flex: 1 }} titulo={`Devolver${elegidas.length ? ` ≈ ${dinero(estimado)}` : ''}`} variante="peligro" cargando={guardando}
        deshabilitado={!elegidas.length || motivo.trim().length < 3 || !metodoId} onPress={devolver} />}>
      {lineas.map((d) => {
        const n = cantidades[d.id] ?? 0;
        return (
          <View key={d.id} style={e.devLinea}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={e.texto}>{d.nombre}</Text>
              <Text style={e.suave}>Se puede devolver {cantidad(d.disponible)}{d.cantidad_devuelta > 0 ? ` (ya se devolvieron ${cantidad(d.cantidad_devuelta)})` : ''}</Text>
              {n > 0 && (
                <Pressable onPress={() => setDanados((x) => ({ ...x, [d.id]: !x[d.id] }))} style={e.check}>
                  <View style={[e.casilla, !danados[d.id] && e.casillaOn]}>{!danados[d.id] && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}</View>
                  <Text style={e.suave}>{danados[d.id] ? 'Dañado: no vuelve al inventario' : 'En buen estado: vuelve al inventario'}</Text>
                </Pressable>
              )}
            </View>
            <Pressable style={e.paso} onPress={() => cambiar(d, -1)}><Text style={e.pasoTexto}>−</Text></Pressable>
            <Text style={e.numero}>{cantidad(n)}</Text>
            <Pressable style={e.paso} onPress={() => cambiar(d, 1)}><Text style={e.pasoTexto}>+</Text></Pressable>
          </View>
        );
      })}
      <Campo etiqueta="Motivo" value={motivo} onChangeText={setMotivo} placeholder="Venía en mal estado, se equivocó de sabor..." maxLength={300} />
      <Text style={e.texto}>¿Cómo se le devuelve?</Text>
      <View style={e.chips}>
        {metodos.map((m) => (
          <Pressable key={m.id} onPress={() => setMetodoId(m.id)} style={[e.chip, metodoId === m.id && e.chipActivo]}>
            <Text style={[e.chipTexto, metodoId === m.id && { color: '#fff' }]}>{m.tipo === 'credito' ? 'Descontar de su cuenta' : m.nombre}</Text>
          </Pressable>
        ))}
      </View>
    </Ventana>
  );
}

const e = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo },
  contenido: { padding: 16, gap: 14, maxWidth: 760, width: '100%', alignSelf: 'center' },
  bloque: { backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 16, gap: 10 },
  linea: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  texto: { fontSize: 16, color: C.texto },
  suave: { fontSize: 14, color: C.suave },
  separador: { height: 1, backgroundColor: C.borde },
  totalTexto: { fontSize: 22, fontWeight: '800', color: C.texto },
  acciones: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  devLinea: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: radio, borderWidth: 1, borderColor: C.borde },
  paso: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  pasoTexto: { fontSize: 22, fontWeight: '700', color: C.texto },
  numero: { minWidth: 32, textAlign: 'center', fontSize: 16, fontWeight: '700', color: C.texto },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  casilla: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#9CA3AF', alignItems: 'center', justifyContent: 'center' },
  casillaOn: { backgroundColor: C.exito, borderColor: C.exito },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: C.borde },
  chipActivo: { backgroundColor: C.texto, borderColor: C.texto },
  chipTexto: { fontWeight: '600', color: C.texto },
});
