// Pedidos de mostrador «por cobrar»: la comanda ya salió a cocina o barra y se cobran
// cuando el cliente recoge. Una sola ventana a la vez: lista → pedido → cobro o cancelar.
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CobroModal, Pago } from '@/components/cobro';
import { Boton, Campo, Etiqueta, Ventana } from '@/components/ui';
import { VentaCobrada, VentaCobradaDatos } from '@/components/ventaCobrada';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar } from '@/lib/aviso';
import { cantidad, dinero, nuevoUuid, transcurrido } from '@/lib/formato';
import * as op from '@/lib/operaciones';
import * as srv from '@/lib/servicios';
import { ItemOrden, MetodoPago } from '@/lib/tipos';

type Props = {
  visible: boolean; cajaId: number | null; metodos: MetodoPago[]; pedidos: op.PedidoMostrador[];
  onCerrar: () => void; onCambio: () => void;
  // «Agregar productos»: vuelve a la venta rápida y lo que se envíe se suma a este pedido
  onAgregarA: (pedido: op.PedidoMostrador) => void;
};

type Modo = { tipo: 'lista' } | { tipo: 'pedido'; ticketId: number } | { tipo: 'cobro'; ticketId: number }
  | { tipo: 'quitar'; ticketId: number; item: ItemOrden };

// Se monta de cero cada vez que se abre: empieza en la lista
export function PedidosMostrador({ visible, ...props }: Props) {
  return visible ? <Contenido {...props} /> : null;
}

function Contenido({ cajaId, metodos, pedidos, onCerrar, onCambio, onAgregarA }: Omit<Props, 'visible'>) {
  const [modo, setModo] = useState<Modo>({ tipo: 'lista' });
  const [cobrada, setCobrada] = useState<VentaCobradaDatos | null>(null);
  const [cobrando, setCobrando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());
  // Productos marcados para cobrar solo esos (vacío = todo lo pendiente)
  const [seleccion, setSeleccion] = useState<number[]>([]);
  const uuidCobro = useRef(nuevoUuid());

  // El tiempo de espera de cada pedido se actualiza solo
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30 * 1000);
    return () => clearInterval(t);
  }, []);

  const pedido = modo.tipo !== 'lista' ? pedidos.find((p) => p.ticket_id === modo.ticketId) ?? null : null;
  const volverALista = () => { setSeleccion([]); setModo({ tipo: 'lista' }); };
  const pendientes = pedido?.items.filter((i) => !i.pagado && i.estado !== 'cancelado') ?? [];
  const elegidos = pendientes.filter((i) => seleccion.includes(i.id));
  const aCobrar = elegidos.length ? elegidos : pendientes;
  const montoACobrar = Math.round(aCobrar.reduce((t, i) => t + i.subtotal, 0) * 100) / 100;
  const alternar = (id: number) => setSeleccion((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const cobrar = async (pagos: Pago[]) => {
    if (!pedido || !cajaId) return;
    setCobrando(true);
    try {
      const parcial = elegidos.length > 0 && elegidos.length < pendientes.length;
      const res = await srv.cobrarOrden(pedido.orden_id, {
        uuid: uuidCobro.current, caja_id: cajaId, ticket_id: pedido.ticket_id, pagos,
        item_ids: elegidos.length ? elegidos.map((i) => i.id) : undefined,
      });
      uuidCobro.current = nuevoUuid();
      // El ticket del cliente sale en la térmica de la caja; imprimir nunca frena el cobro
      srv.imprimirTicketVenta(res.venta.id, cajaId).catch(() => null);
      // El cambio queda en pantalla hasta tocar «Listo»
      setCobrada({ ...res.venta, nota: `${pedido.nombre}${parcial ? ' · el resto del pedido sigue por cobrar' : ''}` });
      setSeleccion([]);
      // Si quedó algo pendiente se sigue en el pedido; si no, vuelve a la lista
      if (parcial) setModo({ tipo: 'pedido', ticketId: pedido.ticket_id });
      else volverALista();
      onCambio();
    } catch (err) {
      avisar('No se pudo cobrar', mensajeError(err));
    } finally {
      setCobrando(false);
    }
  };

  const quitar = async () => {
    if (modo.tipo !== 'quitar') return;
    setOcupado(true);
    try {
      const res = await srv.quitarItem(modo.item.id, motivo.trim());
      if (res.impresion?.errores.length) avisar('No se imprimió el aviso CANCELADO', res.impresion.errores.join('\n'));
      setMotivo('');
      setModo({ tipo: 'pedido', ticketId: modo.ticketId });
      onCambio();
    } catch (err) {
      avisar('No se pudo cancelar', mensajeError(err));
    } finally {
      setOcupado(false);
    }
  };

  if (cobrada) return <VentaCobrada venta={cobrada} cajaId={cajaId} onListo={() => setCobrada(null)} />;

  if (modo.tipo === 'cobro' && pedido) {
    return <CobroModal visible titulo={`${elegidos.length ? `Cobrar ${elegidos.length} producto(s)` : 'Cobrar pedido'} de ${pedido.nombre}`}
      total={montoACobrar} metodos={metodos} cobrando={cobrando}
      onCerrar={() => setModo({ tipo: 'pedido', ticketId: pedido.ticket_id })} onCobrar={cobrar} />;
  }

  if (modo.tipo === 'quitar' && pedido) {
    return (
      <Ventana visible titulo="Cancelar producto" subtitulo={`${cantidad(modo.item.cantidad)} × ${modo.item.descripcion} · ${pedido.nombre}`}
        onCerrar={() => setModo({ tipo: 'pedido', ticketId: pedido.ticket_id })} ancho={460}
        pie={<Boton estilo={{ flex: 1 }} titulo="Cancelar producto" variante="peligro" cargando={ocupado}
          deshabilitado={motivo.trim().length < 3} onPress={quitar} />}>
        <Campo etiqueta="Motivo" value={motivo} onChangeText={setMotivo} placeholder="El cliente cambió de opinión..." maxLength={200} />
        <Text style={e.suave}>Sale un aviso CANCELADO en su área. Pide el PIN del administrador.</Text>
      </Ventana>
    );
  }

  if (modo.tipo === 'pedido' && pedido) {
    const vigentes = pedido.items.filter((i) => i.estado !== 'cancelado');
    return (
      <Ventana visible titulo={`Pedido de ${pedido.nombre}`} ancho={620} onCerrar={onCerrar}
        subtitulo={`Espera ${transcurrido(pedido.creado_at ?? '', ahora).slice(0, 5)} · ${pedido.usuario ?? ''} · marca productos para cobrar solo esos`}
        pie={
          <>
            <Boton estilo={{ flex: 1 }} titulo="Volver" variante="neutro" onPress={volverALista} />
            <Boton estilo={{ flex: 1 }} titulo="Agregar productos" variante="contorno" onPress={() => onAgregarA(pedido)} />
            <Boton estilo={{ flex: 1 }} variante="exito" deshabilitado={!aCobrar.length}
              titulo={elegidos.length ? `Cobrar ${elegidos.length} · ${dinero(montoACobrar)}` : `Cobrar todo ${dinero(montoACobrar)}`}
              onPress={() => setModo({ tipo: 'cobro', ticketId: pedido.ticket_id })} />
          </>
        }>
        {pedido.items.map((i) => {
          const cancelado = i.estado === 'cancelado';
          const marcable = !cancelado && !i.pagado;
          const marcado = seleccion.includes(i.id);
          return (
            <Pressable key={i.id} onPress={() => marcable && alternar(i.id)} style={[e.item, (cancelado || i.pagado) && { opacity: 0.5 }]}>
              <View style={[e.casilla, marcado && e.casillaMarcada, !marcable && { borderColor: 'transparent' }]}>
                {marcado && <Text style={e.palomita}>✓</Text>}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[e.itemNombre, cancelado && { textDecorationLine: 'line-through' }]}>{cantidad(i.cantidad)} × {i.descripcion}</Text>
                {i.notas && <Text style={e.suave}>Nota: {i.notas}</Text>}
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {i.pagado && <Etiqueta texto="Pagado" fondo="#DCFCE7" color="#166534" />}
                  <Text style={e.suave}>{cancelado ? `Cancelado: ${i.motivo_cancelacion ?? ''}` : `${i.area ?? 'Sin área'}${i.comanda ? ` · comanda #${i.comanda}` : ''}`}</Text>
                </View>
              </View>
              <Text style={e.itemTotal}>{dinero(i.subtotal)}</Text>
              {marcable && vigentes.length > 0 && (
                <Pressable onPress={() => { setMotivo(''); setModo({ tipo: 'quitar', ticketId: pedido.ticket_id, item: i }); }} hitSlop={8}>
                  <Text style={e.quitar}>Cancelar</Text>
                </Pressable>
              )}
            </Pressable>
          );
        })}
      </Ventana>
    );
  }

  return (
    <Ventana visible titulo="Pedidos por cobrar" ancho={620} onCerrar={onCerrar}
      subtitulo={pedidos.length ? 'La comanda ya salió. Toca un pedido para cobrarlo, agregarle o cancelar algo.' : undefined}>
      {pedidos.length === 0 && <Text style={[e.suave, { textAlign: 'center', padding: 16 }]}>No hay pedidos pendientes de cobro</Text>}
      {pedidos.map((p) => {
        const pendientesDe = p.items.filter((i) => i.estado !== 'cancelado' && !i.pagado);
        const minutos = Math.floor((ahora - new Date((p.creado_at ?? '').replace(' ', 'T')).getTime()) / 60000);
        return (
          <Pressable key={p.ticket_id} onPress={() => { setSeleccion([]); setModo({ tipo: 'pedido', ticketId: p.ticket_id }); }} style={e.pedido}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={e.pedidoNombre}>{p.nombre}</Text>
              <Text style={e.suave} numberOfLines={1}>
                {pendientesDe.map((i) => `${cantidad(i.cantidad)} ${i.nombre}`).join(', ')}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={e.pedidoTotal}>{dinero(p.por_cobrar)}</Text>
              <Etiqueta texto={minutos < 1 ? 'Recién' : `${minutos} min`} fondo={minutos >= 30 ? '#FEE2E2' : '#FEF3C7'} color={minutos >= 30 ? '#B91C1C' : '#92400E'} />
            </View>
          </Pressable>
        );
      })}
    </Ventana>
  );
}

const e = StyleSheet.create({
  suave: { fontSize: 13, color: C.suave },
  pedido: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radio, borderWidth: 1, borderColor: C.borde, backgroundColor: '#fff' },
  pedidoNombre: { fontSize: 17, fontWeight: '800', color: C.texto },
  pedidoTotal: { fontSize: 18, fontWeight: '800', color: C.texto },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderColor: C.borde },
  itemNombre: { fontSize: 15, fontWeight: '600', color: C.texto },
  itemTotal: { minWidth: 70, textAlign: 'right', fontSize: 15, fontWeight: '700', color: C.texto },
  quitar: { color: C.peligro, fontWeight: '700' },
  casilla: { width: 28, height: 28, borderRadius: 6, borderWidth: 2, borderColor: '#9CA3AF', alignItems: 'center', justifyContent: 'center' },
  casillaMarcada: { backgroundColor: C.exito, borderColor: C.exito },
  palomita: { color: '#fff', fontWeight: '800' },
});
