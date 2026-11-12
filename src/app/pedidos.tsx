import { Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BuscarCliente } from '@/components/clientes';
import { Encabezado } from '@/components/encabezado';
import { SelectorFechaFutura, SelectorHora } from '@/components/filtroFechas';
import { Boton, Campo, Etiqueta, Ventana } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar } from '@/lib/aviso';
import { cantidad, dinero, fecha, hoy, nuevoUuid } from '@/lib/formato';
import * as op from '@/lib/operaciones';
import { getCatalogosCaja } from '@/lib/servicios';
import { useSesion } from '@/lib/sesion';
import { sinTildes } from '@/lib/texto';
import { MetodoPago } from '@/lib/tipos';

type Estado = 'abierto' | 'cobrado' | 'cancelado';
const ESTADOS: [Estado, string][] = [['abierto', 'Pendientes'], ['cobrado', 'Entregados'], ['cancelado', 'Cancelados']];

// Encargos (pasteles, pedidos grandes): fecha de entrega, anticipo y lo que falta cobrar al entregar
export default function PedidosEspeciales() {
  const [estado, setEstado] = useState<Estado>('abierto');
  const [buscar, setBuscar] = useState('');
  const [lista, setLista] = useState<op.PedidoEspecial[] | null>(null);
  const [error, setError] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const [detalle, setDetalle] = useState<op.PedidoEspecial | null>(null);
  const [anticipo, setAnticipo] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  const cargar = useCallback(() => {
    op.getPedidosEspeciales({ estado, buscar: buscar.trim() || undefined })
      .then((l) => { setLista(l); setError(''); }).catch((err) => setError(mensajeError(err)));
  }, [estado, buscar]);
  useFocusEffect(useCallback(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]));

  const refrescar = () => {
    cargar();
    if (detalle) op.getPedidoEspecial(detalle.id).then(setDetalle).catch(() => null);
  };

  return (
    <SafeAreaView style={e.pantalla} edges={['top', 'left', 'right', 'bottom']}>
      <Encabezado titulo="Pedidos especiales" subtitulo="Encargos con fecha de entrega y anticipo"
        derecha={<Boton titulo="+ Nuevo pedido" chico onPress={() => setNuevo(true)} />} />
      <View style={e.barra}>
        <View style={e.chips}>
          {ESTADOS.map(([v, t]) => (
            <Pressable key={v} onPress={() => { setEstado(v); setLista(null); }} style={[e.chip, estado === v && e.chipActivo]}>
              <Text style={[e.chipTexto, estado === v && { color: '#fff' }]}>{t}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput style={[e.buscar, { flex: 1, minWidth: 220 }]} value={buscar} onChangeText={setBuscar} placeholder="Número, nombre o teléfono" placeholderTextColor={C.tenue} />
      </View>
      {error ? <Text style={e.error}>{error}</Text> : null}
      <FlatList
        data={lista ?? []}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={e.lista}
        ListEmptyComponent={<Text style={e.vacio}>{lista ? 'No hay pedidos aquí.' : 'Cargando...'}</Text>}
        renderItem={({ item: p }) => {
          const dia = p.fecha_entrega?.slice(0, 10) ?? '';
          const atrasado = p.estado === 'abierto' && dia < hoy();
          const esHoy = p.estado === 'abierto' && dia === hoy();
          return (
            <Pressable onPress={() => setDetalle(p)} style={({ pressed }) => [e.tarjeta, pressed && { opacity: 0.8 }]}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={e.titulo}>{p.numero} · {p.cliente ?? p.nombre ?? 'Sin nombre'}</Text>
                <Text style={e.suave} numberOfLines={1}>{p.items.map((i) => `${cantidad(i.cantidad)} ${i.nombre}`).join(', ')}</Text>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <Text style={[e.suave, (atrasado || esHoy) && { fontWeight: '700', color: atrasado ? C.peligro : '#92400E' }]}>Entrega {fecha(p.fecha_entrega)}</Text>
                  {atrasado && <Etiqueta texto="Atrasado" fondo="#FEE2E2" color="#B91C1C" />}
                  {esHoy && <Etiqueta texto="Hoy" fondo="#FEF3C7" color="#92400E" />}
                </View>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={e.total}>{dinero(p.total)}</Text>
                {p.estado === 'abierto' && <Text style={e.suave}>Anticipo {dinero(p.anticipo)} · falta {dinero(p.pendiente)}</Text>}
                {p.venta && <Text style={e.suave}>Venta {p.venta.numero}</Text>}
              </View>
            </Pressable>
          );
        }}
      />

      <NuevoPedido visible={nuevo} onCerrar={() => setNuevo(false)} onCreado={() => { setNuevo(false); setEstado('abierto'); cargar(); }} />

      {detalle && (
        <Ventana visible titulo={`${detalle.numero} · ${detalle.cliente ?? detalle.nombre ?? ''}`} ancho={640} onCerrar={() => setDetalle(null)}
          subtitulo={`Entrega ${fecha(detalle.fecha_entrega)}${detalle.telefono ? ` · Tel. ${detalle.telefono}` : ''} · tomado por ${detalle.usuario ?? ''}`}
          pie={detalle.estado === 'abierto' ? (
            <View style={{ flex: 1, gap: 8 }}>
              <Boton titulo={`Entregar y cobrar ${dinero(detalle.pendiente)}`} variante="exito"
                onPress={() => { setDetalle(null); router.push(`/venta?pedido=${detalle.id}` as Href); }} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Boton estilo={{ flex: 1 }} titulo="Agregar anticipo" variante="contorno" deshabilitado={detalle.pendiente <= 0} onPress={() => setAnticipo(true)} />
                <Boton estilo={{ flex: 1 }} titulo="Cancelar pedido" variante="neutro" onPress={() => setCancelando(true)} />
              </View>
            </View>
          ) : undefined}>
          {detalle.items.map((i, n) => (
            <View key={n} style={e.fila}>
              <View style={{ flex: 1 }}>
                <Text style={e.texto}>{cantidad(i.cantidad)} × {i.nombre}</Text>
                {i.notas ? <Text style={e.nota}>{i.notas}</Text> : null}
                {!i.disponible && <Text style={{ color: C.peligro, fontSize: 13 }}>Ya no se vende: no se podrá cobrar así</Text>}
              </View>
              <Text style={e.texto}>{dinero(i.precio_unitario * i.cantidad)}</Text>
            </View>
          ))}
          {detalle.observaciones ? <Text style={e.nota}>Observaciones: {detalle.observaciones}</Text> : null}
          <View style={e.fila}><Text style={e.texto}>Total</Text><Text style={e.total}>{dinero(detalle.total)}</Text></View>
          {detalle.anticipos.map((a, n) => (
            <View key={n} style={e.fila}>
              <Text style={e.suave}>{a.tipo === 'devolucion' ? 'Anticipo devuelto' : 'Anticipo'} · {fecha(a.fecha)}</Text>
              <Text style={e.suave}>{dinero(a.monto)}</Text>
            </View>
          ))}
          {detalle.estado === 'abierto' && <View style={e.fila}><Text style={e.texto}>Falta cobrar</Text><Text style={[e.total, { color: '#92400E' }]}>{dinero(detalle.pendiente)}</Text></View>}
          {detalle.estado === 'cancelado' && <Text style={{ color: C.peligro }}>Cancelado: {detalle.motivo_cancelacion}</Text>}
          {detalle.venta && <Text style={e.suave}>Entregado con la venta {detalle.venta.numero}</Text>}
        </Ventana>
      )}

      {detalle && <Anticipo visible={anticipo} pedido={detalle} onCerrar={() => setAnticipo(false)} onListo={() => { setAnticipo(false); refrescar(); }} />}
      {detalle && <Cancelar visible={cancelando} pedido={detalle} onCerrar={() => setCancelando(false)} onListo={() => { setCancelando(false); setDetalle(null); cargar(); }} />}
    </SafeAreaView>
  );
}

// Formas de pago de la caja (sin crédito) con el efectivo elegido de entrada
function useMetodos() {
  const [metodos, setMetodos] = useState<MetodoPago[]>([]);
  const [metodoId, setMetodoId] = useState<number | null>(null);
  useEffect(() => {
    getCatalogosCaja().then((c) => {
      const l = c.metodos_pago.filter((m) => m.tipo !== 'credito');
      setMetodos(l);
      setMetodoId(l.find((m) => m.afecta_efectivo)?.id ?? l[0]?.id ?? null);
    }).catch(() => null);
  }, []);
  return { metodos, metodoId, setMetodoId, metodo: metodos.find((m) => m.id === metodoId) };
}

function Metodos({ metodos, metodoId, onElegir }: { metodos: MetodoPago[]; metodoId: number | null; onElegir: (id: number) => void }) {
  return (
    <View style={e.chips}>
      {metodos.map((m) => (
        <Pressable key={m.id} onPress={() => onElegir(m.id)} style={[e.chip, metodoId === m.id && e.chipActivo]}>
          <Text style={[e.chipTexto, metodoId === m.id && { color: '#fff' }]}>{m.nombre}</Text>
        </Pressable>
      ))}
    </View>
  );
}

interface LineaPedido { producto: op.ProductoPos; cantidad: string; notas: string }

function NuevoPedido({ visible, ...props }: { visible: boolean; onCerrar: () => void; onCreado: () => void }) {
  return visible ? <FormPedido {...props} /> : null;
}

function FormPedido({ onCerrar, onCreado }: { onCerrar: () => void; onCreado: () => void }) {
  const { cajaId } = useSesion();
  const [catalogo, setCatalogo] = useState<op.ProductoPos[]>([]);
  const [cliente, setCliente] = useState<op.Cliente | null>(null);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [dia, setDia] = useState(hoy(1));
  const [horaEntrega, setHoraEntrega] = useState('10:00');
  const [lineas, setLineas] = useState<LineaPedido[]>([]);
  const [buscar, setBuscar] = useState('');
  const [obs, setObs] = useState('');
  const [anticipo, setAnticipo] = useState('');
  const [referencia, setReferencia] = useState('');
  const { metodos, metodoId, setMetodoId, metodo } = useMetodos();
  const [guardando, setGuardando] = useState(false);
  const [uuid] = useState(nuevoUuid);

  useEffect(() => { op.getCatalogoPos().then((c) => setCatalogo(c.productos)).catch(() => null); }, []);

  const encontrados = useMemo(() => {
    const t = sinTildes(buscar.trim());
    return t ? catalogo.filter((p) => sinTildes(p.nombre).includes(t)).slice(0, 8) : [];
  }, [buscar, catalogo]);
  const total = lineas.reduce((t, l) => t + l.producto.precio * Number(l.cantidad || 0), 0);
  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(dia) && /^\d{2}:\d{2}$/.test(horaEntrega);
  const montoAnticipo = Number(anticipo || 0);
  const valido = (cliente || nombre.trim()) && lineas.length > 0 && lineas.every((l) => Number(l.cantidad) > 0) && fechaValida
    && montoAnticipo <= total + 0.001 && !(montoAnticipo > 0 && metodo?.requiere_referencia && !referencia.trim());

  const cambiar = (i: number, cambio: Partial<LineaPedido>) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...cambio } : l)));

  const guardar = async () => {
    if (montoAnticipo > 0 && !cajaId) return avisar('Elige la caja de esta tablet', 'El anticipo entra a su caja.');
    setGuardando(true);
    try {
      const r = await op.crearPedidoEspecial({
        uuid, caja_id: cajaId ?? undefined, cliente_id: cliente?.id ?? null,
        nombre: cliente ? undefined : nombre.trim(), telefono: telefono.trim() || cliente?.telefono || undefined,
        fecha_entrega: `${dia} ${horaEntrega}`, observaciones: obs.trim() || undefined,
        items: lineas.map((l) => ({ producto_id: l.producto.id, cantidad: Number(l.cantidad), notas: l.notas.trim() || undefined })),
        anticipo: montoAnticipo || undefined, metodo_pago_id: montoAnticipo > 0 ? metodoId ?? undefined : undefined,
        referencia: referencia.trim() || undefined,
      });
      avisar(r.message);
      onCreado();
    } catch (err) {
      avisar('No se pudo guardar el pedido', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  if (buscandoCliente) {
    return <BuscarCliente visible titulo="Cliente del pedido" onCerrar={() => setBuscandoCliente(false)}
      onElegir={(c) => { setCliente(c); setBuscandoCliente(false); }} />;
  }

  return (
    <Ventana visible titulo="Nuevo pedido especial" onCerrar={onCerrar} ancho={720}
      pie={<Boton estilo={{ flex: 1 }} titulo={`Guardar pedido · ${dinero(total)}`} variante="exito" cargando={guardando} deshabilitado={!valido} onPress={guardar} />}>
      <Text style={e.etiqueta}>¿Para quién?</Text>
      {cliente ? (
        <View style={e.fila}>
          <Text style={[e.texto, { flex: 1 }]}>{cliente.nombre}{cliente.telefono ? ` · ${cliente.telefono}` : ''}</Text>
          <Pressable onPress={() => setCliente(null)} hitSlop={8}><Text style={{ color: C.peligro, fontWeight: '700' }}>Quitar</Text></Pressable>
        </View>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Campo value={nombre} onChangeText={setNombre} placeholder="Nombre" maxLength={100} /></View>
            <View style={{ flex: 1 }}><Campo value={telefono} onChangeText={setTelefono} placeholder="Teléfono" keyboardType="phone-pad" maxLength={30} /></View>
          </View>
          <Boton titulo="O elegir un cliente registrado" variante="contorno" chico onPress={() => setBuscandoCliente(true)} />
        </>
      )}

      <Text style={e.etiqueta}>Entrega</Text>
      <View style={e.chips}>
        <SelectorFechaFutura valor={dia} onCambio={setDia} />
      </View>
      <Text style={e.etiqueta}>Hora de entrega</Text>
      <SelectorHora valor={horaEntrega} onCambio={setHoraEntrega} />

      <Text style={e.etiqueta}>Productos</Text>
      {lineas.map((l, i) => (
        <View key={i} style={e.lineaPedido}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={[e.texto, { flex: 1, fontWeight: '700' }]}>{l.producto.nombre} · {dinero(l.producto.precio)}</Text>
            <View style={{ width: 90 }}><Campo value={l.cantidad} onChangeText={(t) => cambiar(i, { cantidad: t.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" /></View>
            <Pressable onPress={() => setLineas((ls) => ls.filter((_, j) => j !== i))} hitSlop={8}><Text style={{ color: C.peligro, fontWeight: '700' }}>Quitar</Text></Pressable>
          </View>
          <Campo value={l.notas} onChangeText={(t) => cambiar(i, { notas: t })} placeholder="Sabor, dedicatoria, color..." maxLength={200} />
        </View>
      ))}
      <TextInput style={e.buscar} value={buscar} onChangeText={setBuscar} placeholder="Buscar producto para agregar" placeholderTextColor={C.tenue} />
      {encontrados.map((p) => (
        <Pressable key={p.id} onPress={() => { setLineas((ls) => [...ls, { producto: p, cantidad: '1', notas: '' }]); setBuscar(''); }} style={e.resultado}>
          <Text style={e.texto}>+ {p.nombre}</Text><Text style={e.suave}>{dinero(p.precio)}</Text>
        </Pressable>
      ))}
      <Campo etiqueta="Observaciones" value={obs} onChangeText={setObs} placeholder="Recoge el papá, llamar antes..." maxLength={500} />

      <Text style={e.etiqueta}>Anticipo (opcional) · total {dinero(total)}</Text>
      <Campo value={anticipo} onChangeText={(t) => setAnticipo(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0.00" />
      {montoAnticipo > total + 0.001 && <Text style={{ color: C.peligro }}>El anticipo no puede ser mayor que el total.</Text>}
      {montoAnticipo > 0 && <Metodos metodos={metodos} metodoId={metodoId} onElegir={setMetodoId} />}
      {montoAnticipo > 0 && metodo?.requiere_referencia && <Campo etiqueta={`Referencia de ${metodo.nombre}`} value={referencia} onChangeText={setReferencia} maxLength={100} />}
      {montoAnticipo > 0 && <Text style={e.suave}>El anticipo entra a la caja del turno abierto.</Text>}
    </Ventana>
  );
}

function Anticipo({ visible, ...props }: { visible: boolean; pedido: op.PedidoEspecial; onCerrar: () => void; onListo: () => void }) {
  return visible ? <FormAnticipo {...props} /> : null;
}

function FormAnticipo({ pedido, onCerrar, onListo }: { pedido: op.PedidoEspecial; onCerrar: () => void; onListo: () => void }) {
  const { cajaId } = useSesion();
  const [monto, setMonto] = useState('');
  const [referencia, setReferencia] = useState('');
  const { metodos, metodoId, setMetodoId, metodo } = useMetodos();
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (!cajaId) return avisar('Elige la caja de esta tablet');
    setGuardando(true);
    try {
      const r = await op.anticipoPedido(pedido.id, { caja_id: cajaId, monto: Number(monto), metodo_pago_id: metodoId ?? undefined, referencia: referencia.trim() || undefined });
      avisar(r.message);
      onListo();
    } catch (err) {
      avisar('No se pudo registrar', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const valido = Number(monto) > 0 && Number(monto) <= pedido.pendiente + 0.001 && !(metodo?.requiere_referencia && !referencia.trim());
  return (
    <Ventana visible titulo={`Anticipo para ${pedido.numero}`} subtitulo={`Falta cobrar ${dinero(pedido.pendiente)}`} onCerrar={onCerrar} ancho={480}
      pie={<Boton estilo={{ flex: 1 }} titulo="Recibir anticipo" variante="exito" cargando={guardando} deshabilitado={!valido} onPress={guardar} />}>
      <Campo etiqueta="Monto" value={monto} onChangeText={(t) => setMonto(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" autoFocus />
      <Metodos metodos={metodos} metodoId={metodoId} onElegir={setMetodoId} />
      {metodo?.requiere_referencia && <Campo etiqueta={`Referencia de ${metodo.nombre}`} value={referencia} onChangeText={setReferencia} maxLength={100} />}
    </Ventana>
  );
}

function Cancelar({ visible, ...props }: { visible: boolean; pedido: op.PedidoEspecial; onCerrar: () => void; onListo: () => void }) {
  return visible ? <FormCancelar {...props} /> : null;
}

// Si dejó anticipo, se elige si se le devuelve (sale de la caja) o se queda en el negocio
function FormCancelar({ pedido, onCerrar, onListo }: { pedido: op.PedidoEspecial; onCerrar: () => void; onListo: () => void }) {
  const { cajaId } = useSesion();
  const [motivo, setMotivo] = useState('');
  const [devolver, setDevolver] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const { metodos, metodoId, setMetodoId } = useMetodos();

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await op.cancelarPedido(pedido.id, {
        motivo: motivo.trim(), devolver_anticipo: pedido.anticipo > 0 && devolver,
        caja_id: cajaId ?? undefined, metodo_pago_id: pedido.anticipo > 0 && devolver ? metodoId ?? undefined : undefined,
      });
      avisar(r.message);
      onListo();
    } catch (err) {
      avisar('No se pudo cancelar', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Ventana visible titulo={`Cancelar ${pedido.numero}`} onCerrar={onCerrar} ancho={500}
      pie={<Boton estilo={{ flex: 1 }} titulo="Cancelar pedido" variante="peligro" cargando={guardando} deshabilitado={motivo.trim().length < 3} onPress={guardar} />}>
      <Campo etiqueta="Motivo" value={motivo} onChangeText={setMotivo} placeholder="El cliente ya no lo quiere..." maxLength={300} autoFocus />
      {pedido.anticipo > 0 && (
        <>
          <Text style={e.etiqueta}>Dejó {dinero(pedido.anticipo)} de anticipo</Text>
          <View style={e.chips}>
            {([[true, 'Devolverle el anticipo'], [false, 'Retener el anticipo']] as const).map(([v, t]) => (
              <Pressable key={String(v)} onPress={() => setDevolver(v)} style={[e.chip, devolver === v && e.chipActivo]}>
                <Text style={[e.chipTexto, devolver === v && { color: '#fff' }]}>{t}</Text>
              </Pressable>
            ))}
          </View>
          {devolver && <Metodos metodos={metodos} metodoId={metodoId} onElegir={setMetodoId} />}
          {devolver && <Text style={e.suave}>El dinero sale de la caja del turno abierto.</Text>}
        </>
      )}
    </Ventana>
  );
}

const e = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo },
  barra: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: 12, paddingBottom: 0, maxWidth: 900, width: '100%', alignSelf: 'center' },
  buscar: { height: 48, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: radio, paddingHorizontal: 14, fontSize: 16, backgroundColor: '#fff', color: C.texto },
  error: { color: C.peligro, padding: 16 },
  lista: { padding: 12, gap: 8, maxWidth: 900, width: '100%', alignSelf: 'center' },
  vacio: { textAlign: 'center', color: C.suave, padding: 24 },
  tarjeta: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 14 },
  titulo: { fontSize: 16, fontWeight: '700', color: C.texto },
  suave: { fontSize: 13, color: C.suave },
  total: { fontSize: 18, fontWeight: '800', color: C.texto },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderColor: C.borde },
  texto: { fontSize: 15, color: C.texto },
  nota: { fontSize: 14, color: '#92400E', fontWeight: '600' },
  etiqueta: { fontSize: 15, fontWeight: '700', color: C.texto, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: C.borde },
  chipActivo: { backgroundColor: C.texto, borderColor: C.texto },
  chipTexto: { fontWeight: '600', color: C.texto },
  lineaPedido: { gap: 6, padding: 10, borderRadius: radio, borderWidth: 1, borderColor: C.borde },
  resultado: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderRadius: radio, borderWidth: 1, borderColor: C.borde },
});
