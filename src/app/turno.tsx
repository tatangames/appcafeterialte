import { Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Encabezado } from '@/components/encabezado';
import { VentanaMotivo } from '@/components/motivo';
import { Boton, Campo, Cargando, Ventana } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar, avisarYEsperar, confirmar } from '@/lib/aviso';
import { cantidad, dinero, fecha, hora, nuevoUuid } from '@/lib/formato';
import * as op from '@/lib/operaciones';
import { useConexion } from '@/lib/conexion';
import { useSesion } from '@/lib/sesion';

type Datos = Awaited<ReturnType<typeof op.getTurnoCaja>>;

function Tarjeta({ titulo, valor, color = C.texto, ancho }: { titulo: string; valor: string; color?: string; ancho: number }) {
  return (
    <View style={[e.tarjeta, { width: ancho }]}>
      <Text style={e.suave}>{titulo}</Text>
      <Text style={[e.tarjetaValor, { color }]}>{valor}</Text>
    </View>
  );
}

// Turno de la caja de esta tablet: movimientos, corte, cierre y cambio de turno
export default function Turno() {
  const { cajaId, puede, usuario, bloquear } = useSesion();
  const { cola, enLinea, sincronizar } = useConexion();
  const { width } = useWindowDimensions();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Ventanas
  const [movimiento, setMovimiento] = useState<'ingreso' | 'egreso' | null>(null);
  const [abriendoCajon, setAbriendoCajon] = useState(false);
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [anulando, setAnulando] = useState<op.MovimientoCaja | null>(null);
  const [motivo, setMotivo] = useState('');
  const [cerrando, setCerrando] = useState(false);
  const [contadoTexto, setContadoTexto] = useState('');
  const [obs, setObs] = useState('');

  const cargar = useCallback(async () => {
    if (!cajaId) return;
    try {
      setDatos(await op.getTurnoCaja(cajaId));
    } catch (err) {
      avisar('No se pudo cargar el turno', mensajeError(err));
    }
  }, [cajaId]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const contado = Number(contadoTexto || 0);
  const columnas = width >= 900 ? 4 : 2;
  const anchoTarjeta = (Math.min(width, 1100) - 32 - 10 * (columnas - 1)) / columnas;

  if (!cajaId) {
    return (
      <SafeAreaView style={e.pantalla}>
        <Encabezado titulo="Caja y turno" />
        <View style={e.vacio}><Boton titulo="Elegir la caja de esta tablet" onPress={() => router.push('/caja')} /></View>
      </SafeAreaView>
    );
  }
  if (!datos) return <Cargando />;

  const turno = datos.turno;
  const r = datos.resumen;
  // Turno de alguien que se fue sin cerrarlo: solo se puede contar y cerrar
  const ajeno = !!datos.turno_ajeno;

  const guardarMovimiento = async () => {
    if (!turno || !movimiento) return;
    setOcupado(true);
    try {
      await op.registrarMovimiento(turno.id, { uuid: nuevoUuid(), tipo: movimiento, monto: Number(monto), concepto: concepto.trim() });
      setMovimiento(null);
      setMonto('');
      setConcepto('');
      await cargar();
    } catch (err) {
      avisar('No se pudo registrar', mensajeError(err));
    } finally {
      setOcupado(false);
    }
  };

  const anular = async () => {
    if (!anulando) return;
    setOcupado(true);
    try {
      await op.anularMovimiento(anulando.id, motivo.trim());
      setAnulando(null);
      setMotivo('');
      await cargar();
    } catch (err) {
      avisar('No se pudo anular', mensajeError(err));
    } finally {
      setOcupado(false);
    }
  };

  const imprimirCorte = async (turnoId: number, avisarResultado = true) => {
    try {
      const res = await op.imprimirCierre(turnoId, cajaId);
      if (avisarResultado || !res.impreso) avisar(res.impreso ? 'Impreso' : 'No se imprimió', res.impreso ? undefined : res.message);
    } catch (err) {
      avisar('No se pudo imprimir', mensajeError(err));
    }
  };

  // Antes de cerrar: avisa si quedan pedidos de mostrador o mesas sin cobrar
  const pedirCierre = async () => {
    // Las ventas hechas sin conexión deben llegar antes del corte, o faltarían en él
    if (cola.length) {
      if (enLinea) sincronizar();
      return avisar('Hay ventas sin enviar', `${cola.length} venta(s) hechas sin conexión aún no llegan al servidor. ${enLinea ? 'Se están enviando: intenta cerrar en un momento.' : 'Cierra el turno cuando vuelva la conexión.'}`);
    }
    try {
      if (cajaId) {
        const r = await op.getPedidosMostrador(cajaId);
        const lineas = [
          ...r.pedidos.map((p) => `• ${p.nombre}: ${dinero(p.por_cobrar)} (mostrador)`),
          ...r.mesas_por_cobrar.map((m) => `• ${m}`),
        ];
        if (lineas.length && !await confirmar('Hay cuentas sin cobrar',
          `${lineas.join('\n')}\n\nSi ya se entregó, cóbralo antes de cerrar. ¿Cerrar el turno de todos modos?`, 'Cerrar de todos modos')) return;
      }
    } catch {
      // Si no se pudo revisar, se deja cerrar igual
    }
    setCerrando(true);
  };

  const cerrar = async () => {
    if (!turno) return;
    setOcupado(true);
    try {
      const res = await op.cerrarTurno(turno.id, { efectivo_contado: contado, observaciones: obs.trim() || undefined });
      setCerrando(false);
      setContadoTexto('');
      setObs('');
      await imprimirCorte(res.turno.id, false);
      // Cerrado el turno se bloquea la tablet: el siguiente turno lo abre quien entre con su PIN (otro o el mismo)
      const d = res.turno.diferencia ?? 0;
      const cuadre = Math.abs(d) < 0.005 ? 'La caja cuadra' : d < 0 ? `Faltan ${dinero(Math.abs(d))}` : `Sobran ${dinero(d)}`;
      if (ajeno) {
        // Cerró el turno que otro dejó abierto: sigue en su sesión para abrir el suyo
        avisar('Turno cerrado', `${cuadre}. Ahora abre tu turno para empezar a vender.`);
        router.replace('/caja');
        return;
      }
      // Primero lo lee quien cerró; al aceptar se bloquea (si no, el aviso queda detrás del
      // bloqueo y lo ve el siguiente mesero al entrar)
      await avisarYEsperar('Turno cerrado', `${cuadre}. Al aceptar, la tablet se bloquea: quien abra el siguiente turno entra con su PIN.`);
      router.replace('/inicio');
      await bloquear();
    } catch (err) {
      avisar('No se pudo cerrar el turno', mensajeError(err));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <SafeAreaView style={e.pantalla} edges={['top', 'left', 'right', 'bottom']}>
      <Encabezado titulo="Caja y turno" subtitulo={datos.caja.nombre}
        derecha={
          <>
            {puede('caja.historial') && <Boton titulo="Historial de cierres" variante="contorno" chico onPress={() => router.push('/cierres' as Href)} />}
            <Boton titulo="Cambiar caja" variante="contorno" chico onPress={() => router.push('/caja')} />
          </>
        } />

      <ScrollView contentContainerStyle={e.contenido}>
        {!turno ? (
          <View style={e.bloque}>
            <Text style={e.subtitulo}>No hay turno abierto en esta caja</Text>
            <Text style={e.suave}>Para vender y cobrar hay que abrir un turno con el fondo inicial.</Text>
            {puede('caja.abrir') && <Boton titulo="Abrir turno" variante="exito" onPress={() => router.push('/caja')} />}
          </View>
        ) : (
          <>
            <Text style={e.suave}>Abierto por {turno.usuario_apertura} · {fecha(turno.abierto_at)}</Text>
            {ajeno && (
              <View style={e.ajeno}>
                <Text style={e.ajenoTitulo}>Este turno es de {turno.usuario_apertura} y quedó abierto</Text>
                <Text style={e.ajenoTexto}>
                  Cuenta el efectivo de la caja y ciérralo; el cierre queda a tu nombre con la diferencia que salga.
                  Después abre tu turno. Mientras tanto no se puede vender ni registrar ingresos o egresos en él.
                </Text>
              </View>
            )}
            <View style={e.tarjetas}>
              <Tarjeta ancho={anchoTarjeta} titulo="Fondo inicial" valor={dinero(r?.fondo_inicial)} />
              <Tarjeta ancho={anchoTarjeta} titulo="Ventas" valor={dinero(r?.totales.ventas)} color={C.primario} />
              <Tarjeta ancho={anchoTarjeta} titulo="Ingresos / egresos" valor={`${dinero(r?.totales.ingresos)} / ${dinero(r?.totales.egresos)}`} />
              <Tarjeta ancho={anchoTarjeta} titulo="Efectivo en caja" valor={r?.efectivo_esperado == null ? '—' : dinero(r.efectivo_esperado)} color={C.exito} />
            </View>

            <View style={e.acciones}>
              {!ajeno && puede('caja.movimientos') && <Boton estilo={e.accion} titulo="+ Ingreso" variante="exito" onPress={() => setMovimiento('ingreso')} />}
              {!ajeno && puede('caja.movimientos') && <Boton estilo={e.accion} titulo="− Egreso" variante="peligro" onPress={() => setMovimiento('egreso')} />}
              {!ajeno && puede('gastos.registrar') && <Boton estilo={e.accion} titulo="Gasto" variante="contorno" onPress={() => router.push('/gastos?nuevo=1')} />}
              {(puede('caja.movimientos') || puede('pos.vender')) && <Boton estilo={e.accion} titulo="Abrir cajón" variante="contorno" onPress={() => setAbriendoCajon(true)} />}
              {(puede('caja.arqueo') || puede('caja.cerrar')) && <Boton estilo={e.accion} titulo="Corte X" variante="contorno" onPress={() => imprimirCorte(turno.id)} />}
              {puede('caja.cerrar') && <Boton estilo={e.accion} titulo="Cerrar turno" onPress={pedirCierre} />}
            </View>

            {r && (
              <View style={[e.columnas, width >= 900 && { flexDirection: 'row' }]}>
                <View style={[e.bloque, { flex: 1 }]}>
                  <Text style={e.subtitulo}>Por forma de pago</Text>
                  {r.por_metodo.map((m) => (
                    <View key={m.metodo_pago_id} style={e.linea}><Text style={e.texto}>{m.nombre}</Text><Text style={e.texto}>{dinero(m.neto)}</Text></View>
                  ))}
                  <Text style={[e.subtitulo, { marginTop: 8 }]}>Ventas por empleado</Text>
                  {r.ventas_por_usuario.length === 0 && <Text style={e.suave}>Sin ventas todavía</Text>}
                  {r.ventas_por_usuario.map((v) => (
                    <View key={v.usuario_id} style={e.linea}><Text style={e.texto}>{v.usuario} ({v.cantidad})</Text><Text style={e.texto}>{dinero(v.total)}</Text></View>
                  ))}
                </View>

                <View style={[e.bloque, { flex: 1 }]}>
                  <Text style={e.subtitulo}>Por comprar</Text>
                  {r.por_comprar.length === 0 && <Text style={[e.suave, { color: C.exito }]}>Nada bajo el mínimo</Text>}
                  {r.por_comprar.map((p) => (
                    <View key={p.producto_id} style={e.linea}>
                      <Text style={e.texto}>{p.producto}</Text>
                      <Text style={[e.texto, { color: C.aviso }]}>hay {cantidad(p.stock_actual)} {p.unidad ?? ''} · mín {cantidad(p.stock_minimo)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={e.bloque}>
              <Text style={e.subtitulo}>Movimientos del turno ({datos.movimientos?.length ?? 0})</Text>
              {(datos.movimientos ?? []).map((m) => (
                <View key={m.id} style={[e.movimiento, m.anulado && { opacity: 0.45 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[e.texto, m.anulado && { textDecorationLine: 'line-through' }]}>{m.concepto}</Text>
                    <Text style={e.suave}>{hora(m.fecha)} · {m.tipo_texto} · {m.metodo_pago ?? ''} · {m.usuario ?? ''}</Text>
                  </View>
                  <Text style={[e.monto, { color: m.entrada ? C.exito : C.peligro }]}>{m.entrada ? '+' : '−'}{dinero(m.monto)}</Text>
                  {m.manual && !m.anulado && puede('caja.movimientos') && (
                    <Pressable onPress={() => { setMotivo(''); setAnulando(m); }} hitSlop={8}><Text style={e.anular}>Anular</Text></Pressable>
                  )}
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <VentanaMotivo visible={abriendoCajon} titulo="Abrir cajón" textoBoton="Abrir cajón"
        subtitulo="Sin una venta. Queda registrado quién lo abrió y por qué."
        aviso={puede('caja.abrir_cajon') ? undefined : 'Necesita el PIN del administrador.'}
        ejemplo="Cambiar un billete, contar el efectivo..."
        onCerrar={() => setAbriendoCajon(false)}
        onConfirmar={async (m) => {
          const r = await op.abrirCajon(cajaId!, m);
          if (!r.impreso) throw new Error(r.message);
          return { message: 'Cajón abierto' };
        }}
        onListo={() => setAbriendoCajon(false)} />

      <Ventana visible={!!movimiento} titulo={movimiento === 'ingreso' ? 'Ingreso de efectivo' : 'Egreso de efectivo'} onCerrar={() => setMovimiento(null)} ancho={460}
        pie={<Boton estilo={{ flex: 1 }} titulo="Registrar" variante={movimiento === 'ingreso' ? 'exito' : 'peligro'} cargando={ocupado}
          deshabilitado={!(Number(monto) > 0) || concepto.trim().length < 3} onPress={guardarMovimiento} />}>
        <Campo etiqueta="Monto ($)" value={monto} onChangeText={setMonto} keyboardType="decimal-pad" placeholder="0.00" />
        <Campo etiqueta="Concepto" value={concepto} onChangeText={setConcepto} placeholder={movimiento === 'ingreso' ? 'Cambio traído del banco...' : 'Pago a repartidor...'} />
      </Ventana>

      <Ventana visible={!!anulando} titulo="Anular movimiento" subtitulo={anulando ? `${anulando.concepto} · ${dinero(anulando.monto)}` : ''} onCerrar={() => setAnulando(null)} ancho={460}
        pie={<Boton estilo={{ flex: 1 }} titulo="Anular" variante="peligro" cargando={ocupado} deshabilitado={motivo.trim().length < 3} onPress={anular} />}>
        <Campo etiqueta="Motivo" value={motivo} onChangeText={setMotivo} />
      </Ventana>

      <Ventana visible={cerrando} titulo="Cerrar turno" subtitulo="Cuenta la gaveta y escribe el total (incluye el fondo inicial). El dinero se queda en la caja: es el fondo del siguiente turno." onCerrar={() => setCerrando(false)} ancho={520}
        pie={<Boton estilo={{ flex: 1 }} titulo={contadoTexto === '' ? 'Escribe el efectivo contado' : `Cerrar con ${dinero(contado)}`}
          cargando={ocupado} deshabilitado={contadoTexto === ''} onPress={cerrar} />}>
        <Campo etiqueta="Efectivo contado ($)" value={contadoTexto} onChangeText={(v) => setContadoTexto(v.replace(',', '.').replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad" placeholder="0.00" />
        {!datos.cierre_ciego && r?.efectivo_esperado != null && (
          <View style={e.linea}>
            <Text style={e.texto}>Esperado {dinero(r.efectivo_esperado)}</Text>
            <Text style={[e.texto, { color: Math.abs(contado - r.efectivo_esperado) < 0.005 ? C.exito : C.peligro }]}>
              {Math.abs(contado - r.efectivo_esperado) < 0.005 ? 'Cuadra' : `${contado < r.efectivo_esperado ? 'Faltan' : 'Sobran'} ${dinero(Math.abs(contado - r.efectivo_esperado))}`}
            </Text>
          </View>
        )}
        <Campo etiqueta="Observaciones (opcional)" value={obs} onChangeText={setObs} />
        <Text style={e.suave}>Lo cierra {usuario?.nombre}.</Text>
      </Ventana>
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  ajeno: { gap: 4, padding: 14, borderRadius: radio, backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5' },
  ajenoTitulo: { fontSize: 16, fontWeight: '800', color: '#991B1B' },
  ajenoTexto: { fontSize: 14, color: '#7F1D1D' },
  pantalla: { flex: 1, backgroundColor: C.fondo },
  contenido: { padding: 16, gap: 14, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  vacio: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  suave: { fontSize: 13, color: C.suave },
  texto: { fontSize: 15, color: C.texto },
  subtitulo: { fontSize: 17, fontWeight: '700', color: C.texto },
  tarjetas: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tarjeta: { backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 14, gap: 4 },
  tarjetaValor: { fontSize: 22, fontWeight: '800' },
  acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  accion: { flexGrow: 1, minWidth: 140 },
  columnas: { gap: 14 },
  bloque: { backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 14, gap: 8 },
  linea: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  movimiento: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderColor: '#F3F4F6' },
  monto: { fontSize: 16, fontWeight: '700' },
  anular: { color: C.peligro, fontWeight: '600' },
});
