import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AvisosAgregado, useAvisosAgregado } from '@/components/avisosAgregado';
import { CobroModal, Pago } from '@/components/cobro';
import { IngredientesModal } from '@/components/ingredientes';
import { ModificadoresModal } from '@/components/modificadores';
import { Boton, Campo, Cargando, Etiqueta, Ventana } from '@/components/ui';
import { VentaCobrada, VentaCobradaDatos } from '@/components/ventaCobrada';
import { C, radio } from '@/constants/colores';
import { ApiError, mensajeError } from '@/lib/api';
import { avisar, confirmar } from '@/lib/aviso';
import { cantidad, dinero, hora, nuevoUuid, transcurrido } from '@/lib/formato';
import * as srv from '@/lib/servicios';
import { useSesion } from '@/lib/sesion';
import { CatalogoMesas, Comanda, ESTADOS_ITEM, ItemNuevo, ItemOrden, MetodoPago, Orden, ProductoMesa, TerminalMapa, idsModificadores, textoModificador } from '@/lib/tipos';
import { sinTildes } from '@/lib/texto';

// El catálogo cambia poco: se guarda entre mesas y se refresca al entrar
let catalogoGuardado: CatalogoMesas | null = null;
let metodosGuardados: MetodoPago[] = [];

type Vista = 'productos' | 'cuenta';

export default function TerminalMesa() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const terminalId = Number(id);
  const { cajaId, puede } = useSesion();
  const verExistencias = puede('pos.ver_existencias');
  const { width } = useWindowDimensions();
  const ancho = width >= 900;

  const [terminal, setTerminal] = useState<{ nombre: string; capacidad: number } | null>(null);
  const [orden, setOrden] = useState<Orden | null>(null);
  const [cargado, setCargado] = useState(false);
  const [catalogo, setCatalogo] = useState<CatalogoMesas | null>(catalogoGuardado);
  const [metodos, setMetodos] = useState<MetodoPago[]>(metodosGuardados);
  const [ticketId, setTicketId] = useState<number | null>(null);
  // Cuenta ya pagada que se está mirando (solo lectura); null = la cuenta activa
  const [verPagada, setVerPagada] = useState<number | null>(null);
  const [seleccion, setSeleccion] = useState<number[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [vista, setVista] = useState<Vista>('productos');

  // Productos
  const [categoria, setCategoria] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [conExtras, setConExtras] = useState<ProductoMesa | null>(null);

  // Ventanas
  const [cobro, setCobro] = useState<{ titulo: string; total: number; ticketId: number | null; itemIds?: number[] } | null>(null);
  const [cobrando, setCobrando] = useState(false);
  const [cobrada, setCobrada] = useState<(VentaCobradaDatos & { libre: boolean }) | null>(null);
  const uuidCobro = useRef(nuevoUuid());
  const [quitando, setQuitando] = useState<ItemOrden | null>(null);
  const [cuantos, setCuantos] = useState(1);
  const [ajustando, setAjustando] = useState<ItemOrden | null>(null);
  // Producto sin enviar al que se le cambian los extras (era deslactosada, no entera)
  const [editandoExtras, setEditandoExtras] = useState<ItemOrden | null>(null);
  const [anulando, setAnulando] = useState<Comanda | null>(null);
  const [descuento, setDescuento] = useState<number | null>(null); // % del próximo cobro
  const [pidiendoDescuento, setPidiendoDescuento] = useState(false);
  const [textoDescuento, setTextoDescuento] = useState('');
  const [liberando, setLiberando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [verComandas, setVerComandas] = useState(false);
  const [trasladando, setTrasladando] = useState<TerminalMapa[] | null>(null);
  const [mas, setMas] = useState(false);
  const [renombrando, setRenombrando] = useState<{ id: number; nombre: string } | null>(null);
  // Aviso breve al agregar («✓ Americano agregado a Ticket 1») para no tener que ir a la cuenta
  const agregados = useAvisosAgregado();
  // Lo tocado mientras el servidor responde se junta y se manda después: no hay que esperar
  const porAgregar = useRef<{ item: ItemNuevo; ticketId: number | null }[]>([]);
  const agregando = useRef(false);
  const [ahora, setAhora] = useState(() => Date.now());

  const aplicar = useCallback((o: Orden | null) => {
    setOrden(o);
    if (!o) return;
    // La cuenta activa: la elegida si sigue abierta, si no la primera abierta
    setTicketId((actual) => {
      const abiertas = o.tickets.filter((t) => t.estado === 'abierto');
      return abiertas.some((t) => t.id === actual) ? actual : abiertas[0]?.id ?? null;
    });
    setSeleccion((sel) => sel.filter((i) => o.tickets.some((t) => t.items.some((it) => it.id === i && !it.pagado))));
  }, []);

  const cargar = useCallback(async () => {
    try {
      const res = await srv.getTerminal(terminalId);
      setTerminal(res.terminal);
      aplicar(res.orden);
    } catch (e) {
      avisar('No se pudo cargar la mesa', mensajeError(e));
    } finally {
      setCargado(true);
    }
  }, [terminalId, aplicar]);

  // Existencias de las tarjetas (las reales): cambian al cobrar, aquí o en otra mesa/tablet
  const cargarCatalogo = useCallback(() => {
    srv.getCatalogoMesas().then((c) => { catalogoGuardado = c; setCatalogo(c); }).catch(() => null);
  }, []);
  // Tras cada cambio se vuelve a pedir, una sola vez aunque toquen varias veces seguidas
  const esperaCatalogo = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refrescarCatalogo = useCallback(() => {
    if (esperaCatalogo.current) clearTimeout(esperaCatalogo.current);
    esperaCatalogo.current = setTimeout(cargarCatalogo, 600);
  }, [cargarCatalogo]);

  useFocusEffect(useCallback(() => {
    cargar();
    // Otro dispositivo puede agregar o cobrar en la misma mesa, o vender lo que queda
    const intervalo = setInterval(() => { if (!document_oculto()) { cargar(); cargarCatalogo(); } }, 20000);
    return () => clearInterval(intervalo);
  }, [cargar, cargarCatalogo]));

  useEffect(() => {
    cargarCatalogo();
    srv.getCatalogosCaja().then((c) => { metodosGuardados = c.metodos_pago; setMetodos(c.metodos_pago); }).catch(() => null);
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => {
      clearInterval(t);
      if (esperaCatalogo.current) clearTimeout(esperaCatalogo.current);
    };
  }, [cargarCatalogo]);

  /** Corre una acción sobre la orden y aplica la orden que devuelve. */
  const hacer = async <T extends { orden?: Orden; message?: string; avisos?: string[] }>(accion: () => Promise<T | null>, aviso?: boolean): Promise<T | null> => {
    setOcupado(true);
    try {
      const res = await accion();
      if (res?.orden) {
        aplicar(res.orden);
        refrescarCatalogo();
      }
      if (aviso && res?.message) avisar(res.message);
      // Se agregó, pero no alcanza la existencia: el mesero se entera ya; el cobro es el que lo exige
      if (res?.avisos?.length) avisar('Existencia insuficiente', res.avisos.join('\n\n'));
      return res;
    } catch (e) {
      avisar('No se pudo completar', mensajeError(e));
      if (e instanceof ApiError && e.estado === 422) {
        cargar();
        cargarCatalogo();
      }
      return null;
    } finally {
      setOcupado(false);
    }
  };

  // ── Abrir la mesa ───────────────────────────────────────────
  const abrir = () => hacer(() => srv.abrirTerminal(terminalId));

  // ── Productos ───────────────────────────────────────────────
  const productos = useMemo(() => {
    const t = sinTildes(busqueda.trim());
    return (catalogo?.productos ?? []).filter((p) =>
      (!categoria || p.categorias.includes(categoria)) &&
      (!t || sinTildes(p.nombre).includes(t) || p.sku?.toLowerCase() === t || p.codigo_barras === t));
  }, [catalogo, categoria, busqueda]);

  const agregar = async (item: ItemNuevo) => {
    if (!orden) return;
    setConExtras(null);
    porAgregar.current.push({ item, ticketId });
    if (agregando.current) return; // ya hay un envío en curso: al terminar manda lo que se juntó
    agregando.current = true;
    try {
      while (porAgregar.current.length) {
        // Un envío por cuenta: si cambiaron de cuenta a medio camino, lo demás va en el siguiente
        const cuentaId = porAgregar.current[0].ticketId;
        const corte = porAgregar.current.findIndex((x) => x.ticketId !== cuentaId);
        const lote = porAgregar.current.splice(0, corte === -1 ? porAgregar.current.length : corte).map((x) => x.item);
        const res = await hacer(() => srv.agregarItems(orden.id, lote, cuentaId));
        if (!res) { porAgregar.current = []; break; }
        const cuenta = res.orden?.tickets.find((t) => t.id === cuentaId)?.nombre ?? 'la cuenta';
        lote.forEach((i) => {
          const nombre = catalogo?.productos.find((p) => p.id === i.producto_id)?.nombre ?? 'Producto';
          agregados.mostrar(`✓ ${cantidad(i.cantidad)} × ${nombre} agregado a ${cuenta}`);
        });
      }
    } finally {
      agregando.current = false;
    }
  };

  const renombrar = async () => {
    if (!renombrando || !renombrando.nombre.trim()) return;
    const r = renombrando;
    const res = await hacer(() => srv.renombrarTicket(r.id, r.nombre.trim()));
    if (res) setRenombrando(null);
  };

  // Cuenta abierta por error: lo sin enviar se va con ella; lo enviado a cocina no deja borrarla
  const borrarCuenta = async () => {
    if (!ticket) return;
    const t = ticket;
    setMas(false);
    const vivos = t.items.filter((i) => i.estado !== 'cancelado');
    const enviados = vivos.filter((i) => i.estado !== 'pendiente');
    if (enviados.length > 0) {
      return avisar(`No se puede borrar ${t.nombre}`,
        `Tiene ${enviados.length} producto(s) ya enviados a cocina. Cancélalos (con motivo) o muévelos a otra cuenta antes de borrarla.`);
    }
    const detalle = vivos.length > 0
      ? `También se quitan ${vivos.length} producto(s) sin enviar: ${vivos.map((i) => i.descripcion).join(', ')}.`
      : 'La cuenta está vacía.';
    if (!(await confirmar(`¿Borrar ${t.nombre}?`, detalle, 'Borrar'))) return;
    await hacer(() => srv.eliminarTicket(t.id), true);
  };

  // Sin stock negativo (Datos del negocio) lo que dice «Agotado» no se puede agregar. Si queda
  // poco, el servidor igual avisa cuando no alcanza (contando lo de cuentas abiertas)
  const agotado = (p: ProductoMesa) => catalogo?.permitir_stock_negativo === false && !p.permite_sin_existencia
    && ((p.disponible != null && p.disponible <= 0) || (p.alcanza != null && p.alcanza <= 0));

  // Tocar agrega uno; los que llevan extras (o al dejar presionado) abren la ventana
  const tocarProducto = (p: ProductoMesa, largo = false) => {
    if (pagadaVista) return avisar(`${pagadaVista.nombre} ya está pagada`, 'Toca una cuenta abierta (azul) o «+ Cuenta» para agregar productos.');
    if (agotado(p)) return avisar(`${p.nombre} está agotado`, 'Primero hay que registrar la producción, la compra o ajustar el inventario.');
    if (p.grupos.length > 0 || largo) setConExtras(p);
    else agregar({ producto_id: p.id, cantidad: 1 });
  };

  // ── Cuenta ──────────────────────────────────────────────────
  const pagadaVista = verPagada ? orden?.tickets.find((t) => t.id === verPagada && t.estado === 'pagado') ?? null : null;
  const ticket = pagadaVista ?? orden?.tickets.find((t) => t.id === ticketId) ?? null;
  const itemsVisibles = ticket?.items.filter((i) => i.estado !== 'cancelado') ?? [];
  const alternar = (i: ItemOrden) => {
    if (i.pagado) return;
    setSeleccion((s) => (s.includes(i.id) ? s.filter((x) => x !== i.id) : [...s, i.id]));
  };

  const cambiarCantidad = (i: ItemOrden, delta: number) => {
    const nueva = i.cantidad + delta;
    if (nueva <= 0) return quitarPendiente(i);
    hacer(() => srv.actualizarItem(i.id, { cantidad: nueva }));
  };

  const quitarPendiente = (i: ItemOrden) => hacer(() => srv.quitarItem(i.id));

  // El aviso CANCELADO sale en la impresora del área; si no se imprimió, hay que avisar en persona
  const avisoCocina = (impresion: { errores: string[] } | null) => {
    if (impresion?.errores.length) avisar('No se imprimió el aviso a cocina', `${impresion.errores.join('\n')}\nAvisa en persona.`);
  };

  const pedirCancelar = (i: ItemOrden) => { setMotivo(''); setCuantos(i.cantidad); setQuitando(i); };

  const quitarEnviado = async () => {
    if (!quitando) return;
    const item = quitando;
    const res = await hacer(() => srv.quitarItem(item.id, motivo.trim(), cuantos < item.cantidad ? cuantos : undefined));
    if (res) { setQuitando(null); setMotivo(''); avisoCocina(res.impresion); }
  };

  const anularComanda = async () => {
    if (!anulando) return;
    const c = anulando;
    const res = await hacer(() => srv.anularComanda(c.id, motivo.trim()), true);
    if (res) { setAnulando(null); setMotivo(''); avisoCocina(res.impresion); }
  };

  const guardarExtras = async (nuevo: ItemNuevo) => {
    if (!editandoExtras) return;
    const item = editandoExtras;
    const res = await hacer(() => srv.actualizarItem(item.id, { modificadores: nuevo.modificadores ?? [], cantidad: nuevo.cantidad, notas: nuevo.notas ?? null }));
    if (res) setEditandoExtras(null);
  };
  const productoDe = (productoId: number) => catalogo?.productos.find((p) => p.id === productoId) ?? null;

  const recetaDe = (productoId: number) => catalogo?.productos.find((p) => p.id === productoId)?.receta ?? [];

  const guardarAjustes = async (ajustes: { producto_id: number; cantidad: number }[]) => {
    if (!ajustando) return;
    const item = ajustando;
    const res = await hacer(() => srv.actualizarItem(item.id, { ajustes }));
    if (res) setAjustando(null);
  };

  // itemIds: solo los seleccionados (la coca ya, el café después)
  const enviar = async (itemIds?: number[]) => {
    if (!orden) return;
    if (itemIds) setMas(false);
    const res = await hacer(() => srv.enviarComanda(orden.id, itemIds));
    if (!res) return;
    if (itemIds) setSeleccion([]);
    const imp = res.impresion;
    // Lo que se entrega directo (Coca-Cola, pan de vitrina: «Imprime comanda» apagado) no genera comanda
    if (res.comandas.length === 0) avisar('Entregado sin comanda', `${res.message ?? 'Productos entregados (no pasan por cocina)'}. Para que salga en la comanda, enciende «Imprime comanda» en el producto.`);
    else if (imp.sin_impresora) avisar('Comanda registrada', 'No hay impresora configurada: imprímela desde la web o configura la impresora del área.');
    else if (imp.errores.length) avisar('Algunas comandas no se imprimieron', imp.errores.join('\n'));
  };

  const nuevaCuenta = async () => {
    if (!orden) return;
    const res = await hacer(() => srv.crearTicket(orden.id));
    if (res?.ticket_id) setTicketId(res.ticket_id);
  };

  const moverA = async (destino: number) => {
    if (!orden || seleccion.length === 0) return;
    setMas(false);
    const res = await hacer(() => srv.moverItems(orden.id, seleccion, destino));
    if (res) { setSeleccion([]); setTicketId(destino); }
  };

  const moverANueva = async () => {
    if (!orden || seleccion.length === 0) return;
    setMas(false);
    const nueva = await hacer(() => srv.crearTicket(orden.id));
    if (nueva?.ticket_id) await moverA(nueva.ticket_id);
  };

  // Seleccionados que todavía no se envían a cocina o barra
  const porEnviarSeleccion = (orden?.tickets ?? []).flatMap((t) => t.items)
    .filter((i) => seleccion.includes(i.id) && i.estado === 'pendiente').map((i) => i.id);

  const entregarSeleccion = async () => {
    if (!orden || seleccion.length === 0) return;
    setMas(false);
    const res = await hacer(() => srv.entregarItems(orden.id, seleccion), true);
    if (res) setSeleccion([]);
  };

  const precuenta = async (deTicket: number | null) => {
    if (!orden) return;
    setMas(false);
    setOcupado(true);
    try {
      const r = await srv.imprimirPrecuenta(orden.id, deTicket, cajaId);
      avisar(r.impreso ? 'Precuenta impresa' : 'No se imprimió', r.impreso ? undefined : r.message);
    } catch (e) {
      avisar('No se pudo imprimir', mensajeError(e));
    } finally {
      setOcupado(false);
    }
  };

  // ── Cobro ───────────────────────────────────────────────────
  // Igual que el servidor: primero se redondea el descuento y luego se resta
  const conDescuento = (bruto: number) => (descuento ? Math.round((bruto - Math.round(bruto * descuento) / 100) * 100) / 100 : bruto);

  const abrirCobro = (soloSeleccion: boolean, todaLaMesa = false) => {
    if (!cajaId) return avisar('Elige la caja de esta tablet', 'Ve a Caja para elegirla.');
    setMas(false);
    if (todaLaMesa && orden) {
      setCobro({ titulo: 'Cobrar toda la mesa', total: orden.totales.por_cobrar, ticketId: null });
      uuidCobro.current = nuevoUuid();
      return;
    }
    if (!ticket) return;
    if (soloSeleccion) {
      const items = ticket.items.filter((i) => seleccion.includes(i.id) && !i.pagado);
      if (items.length === 0) return avisar('Selecciona los productos a cobrar', 'Tócalos en la cuenta para marcarlos.');
      setCobro({ titulo: `Cobrar ${items.length} producto(s)`, total: items.reduce((t, i) => t + i.subtotal, 0), ticketId: ticket.id, itemIds: items.map((i) => i.id) });
    } else {
      setCobro({ titulo: `Cobrar ${ticket.nombre}`, total: ticket.por_cobrar, ticketId: ticket.id });
    }
    uuidCobro.current = nuevoUuid();
  };

  const cobrar = async (pagos: Pago[]) => {
    if (!orden || !cobro || !cajaId) return;
    setCobrando(true);
    try {
      const res = await srv.cobrarOrden(orden.id, {
        uuid: uuidCobro.current, caja_id: cajaId, ticket_id: cobro.ticketId, item_ids: cobro.itemIds, pagos,
        descuento_global: descuento ? { tipo: 'porcentaje', valor: descuento } : null,
      });
      setCobro(null);
      setDescuento(null);
      setSeleccion([]);
      // El ticket sale en la térmica de la caja; imprimir nunca frena el cobro
      srv.imprimirTicketVenta(res.venta.id, cajaId).catch(() => null);
      const libre = res.orden.estado === 'cerrada';
      // El cambio queda en pantalla hasta tocar «Listo»; si la mesa quedó libre, ahí se vuelve al mapa
      setCobrada({ ...res.venta, libre, nota: libre ? `${res.orden.terminal.nombre} queda libre` : undefined });
      if (!libre) aplicar(res.orden);
    } catch (e) {
      avisar('No se pudo cobrar', mensajeError(e));
    } finally {
      setCobrando(false);
    }
  };

  // ── Mesa ────────────────────────────────────────────────────
  const elegirTraslado = async () => {
    setMas(false);
    try {
      setTrasladando((await srv.getMapa()).filter((t) => t.tipo !== 'caja' && !t.orden && t.id !== terminalId));
    } catch (e) {
      avisar('No se pudo cargar las mesas', mensajeError(e));
    }
  };

  const trasladar = async (destino: TerminalMapa) => {
    if (!orden) return;
    const res = await hacer(() => srv.trasladarOrden(orden.id, destino.id));
    if (res) {
      setTrasladando(null);
      router.replace({ pathname: '/mesa/[id]', params: { id: String(destino.id) } });
    }
  };

  const liberar = async () => {
    if (!orden) return;
    const id = orden.id;
    setOcupado(true);
    try {
      await srv.cerrarOrden(id, motivo.trim() || undefined);
      setLiberando(false);
      setMotivo('');
      router.back();
    } catch (e) {
      avisar('No se pudo liberar', mensajeError(e));
    } finally {
      setOcupado(false);
    }
  };

  const pedirLiberar = async () => {
    setMas(false);
    if (!orden) return;
    if (orden.totales.por_cobrar <= 0.001 && orden.totales.por_enviar === 0) {
      if (await confirmar('Liberar mesa', `¿Dejar ${terminal?.nombre} libre?`, 'Liberar')) liberar();
    } else {
      setLiberando(true);
    }
  };

  // ── Pantalla ────────────────────────────────────────────────
  if (!cargado) return <Cargando />;

  // El cambio queda en pantalla hasta tocar «Listo», aunque la mesa ya quedó libre y la
  // pantalla se recargue sola (cada 20 s): si no, la ventana desaparecía al recargar
  const ventanaCobrada = (
    <VentaCobrada venta={cobrada} cajaId={cajaId} onListo={() => {
      const libre = cobrada?.libre;
      setCobrada(null);
      if (libre) router.back();
    }} />
  );

  if (!orden) {
    return (
      <SafeAreaView style={[e.pantalla, e.centro]}>
        {ventanaCobrada}
        <View style={e.abrir}>
          <Text style={e.titulo}>{terminal?.nombre}</Text>
          <Text style={e.suave}>Mesa libre</Text>
          <Boton titulo={`Abrir ${terminal?.nombre ?? 'mesa'}`} variante="exito" onPress={abrir} cargando={ocupado} />
          <Boton titulo="Volver" variante="contorno" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const abiertas = orden.tickets.filter((t) => t.estado === 'abierto');
  const pagadas = orden.tickets.filter((t) => t.estado === 'pagado');

  const panelProductos = (
    <View style={e.panelProductos}>
      <TextInput style={e.buscar} value={busqueda} onChangeText={setBusqueda} placeholder="Buscar producto" placeholderTextColor={C.tenue} />
      {/* Todas las categorías a la vista: pasan a otra fila si no caben */}
      <View style={e.categorias}>
        {[{ id: 0, nombre: 'Todo' }, ...(catalogo?.categorias ?? [])].map((c) => {
          const activa = (categoria ?? 0) === c.id;
          return (
            <Pressable key={c.id} onPress={() => setCategoria(c.id || null)} style={[e.chip, activa && e.chipActivo]}>
              <Text style={[e.chipTexto, activa && { color: '#fff' }]}>{c.nombre}</Text>
            </Pressable>
          );
        })}
      </View>
      {!catalogo ? <Cargando /> : (
        <FlatList
          data={productos}
          key={ancho ? 'a' : 'b'}
          numColumns={ancho ? 3 : 2}
          keyExtractor={(p) => String(p.id)}
          columnWrapperStyle={{ gap: 10 }}
          contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
          ListEmptyComponent={<Text style={e.suave}>Sin productos</Text>}
          renderItem={({ item: p }) => (
            <Pressable onPress={() => tocarProducto(p)} onLongPress={() => tocarProducto(p, true)}
              style={({ pressed }) => [e.producto, { maxWidth: ancho ? '32%' : '49%', borderTopColor: p.color ?? C.libre, opacity: agotado(p) ? 0.45 : pressed ? 0.7 : 1 }]}>
              <Text style={e.productoNombre} numberOfLines={2}>{p.nombre}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <Text style={e.productoPrecio}>{dinero(p.precio)}{p.grupos.length > 0 ? ' +' : ''}</Text>
                {agotado(p)
                  ? <Text style={{ fontSize: 13, color: C.peligro, fontWeight: '700' }}>Agotado</Text>
                  : verExistencias && p.disponible !== null && p.disponible !== undefined && (
                    <Text style={[{ fontSize: 13, color: C.suave }, (p.bajo_minimo || p.disponible <= 0) && { color: C.peligro, fontWeight: '700' }]}>
                      {cantidad(p.disponible)}{p.permite_fraccion && p.unidad ? ` ${p.unidad}` : ''}
                    </Text>
                  )}
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );

  const panelCuenta = (
    <View style={e.panelCuenta}>
      {/* Todas las cuentas con su total: azules las abiertas, verdes las pagadas (se pueden mirar) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={e.cuentas}>
        <Pressable onPress={nuevaCuenta} style={[e.cuenta, e.cuentaNueva]} disabled={ocupado}>
          <Text style={e.cuentaMas}>+</Text>
          <Text style={e.cuentaNuevaTexto}>Cuenta</Text>
        </Pressable>
        {[...abiertas, ...pagadas].map((t) => {
          const pagada = t.estado === 'pagado';
          const activa = pagada ? verPagada === t.id : !pagadaVista && ticketId === t.id;
          return (
            <Pressable key={t.id} style={[e.cuenta, activa && e.cuentaActiva]}
              onLongPress={() => !pagada && setRenombrando({ id: t.id, nombre: t.nombre })} delayLongPress={400}
              onPress={() => {
                setSeleccion([]);
                if (pagada) setVerPagada(t.id);
                else { setVerPagada(null); setTicketId(t.id); }
              }}>
              <View style={[e.cuentaCabecera, { backgroundColor: pagada ? C.exito : C.libre }]}>
                <Text style={e.cuentaNombre} numberOfLines={1}>{t.nombre}</Text>
              </View>
              <View style={e.cuentaCuerpo}>
                <Text style={e.cuentaMonto}>{dinero(pagada ? t.total : t.por_cobrar)}</Text>
                <Text style={e.cuentaEstado}>{pagada ? '(Pagado)' : `${t.items.filter((i) => i.estado !== 'cancelado').length} producto(s)`}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      {pagadaVista && (
        <Pressable onPress={() => setVerPagada(null)} style={e.avisoPagada}>
          <Text style={e.avisoPagadaTexto}>{pagadaVista.nombre} ya está pagada · solo para ver. Toca aquí para volver a la cuenta abierta.</Text>
        </Pressable>
      )}

      <FlatList
        data={itemsVisibles}
        keyExtractor={(i) => String(i.id)}
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
        ListEmptyComponent={<Text style={[e.suave, { padding: 16, textAlign: 'center' }]}>Toca un producto para agregarlo a esta cuenta. Deja presionada la cuenta para cambiarle el nombre.</Text>}
        renderItem={({ item: i }) => {
          const est = ESTADOS_ITEM[i.estado];
          const elegido = seleccion.includes(i.id);
          return (
            <Pressable onPress={() => alternar(i)} style={[e.linea, elegido && e.lineaElegida, i.pagado && { opacity: 0.5 }]}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={e.lineaNombre}>{cantidad(i.cantidad)} × {i.nombre}</Text>
                {i.modificadores.length > 0 && <Text style={e.suave}>{i.modificadores.map((m) => `+ ${textoModificador(m)}`).join(' · ')}</Text>}
                {(i.texto_ajustes ?? []).length > 0 && <Text style={e.ajuste}>{i.texto_ajustes.map((t) => `! ${t}`).join(' · ')}</Text>}
                {i.notas ? <Text style={e.nota}>“{i.notas}”</Text> : null}
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Etiqueta texto={i.pagado ? 'Pagado' : est.texto} fondo={i.pagado ? '#DCFCE7' : est.fondo} color={i.pagado ? '#166534' : est.color} />
                  {i.area && <Text style={e.suave}>{i.area}</Text>}
                  {/* Quién lo agregó (queda en el reporte «Quién agregó cada producto») */}
                  <Text style={e.suave}>{i.hora}{i.usuario ? ` · ${i.usuario}` : ''}</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={e.lineaMonto}>{dinero(i.subtotal)}</Text>
                {i.estado === 'pendiente' ? (
                  <>
                    <View style={e.pasos}>
                      <Pressable style={e.paso} onPress={() => cambiarCantidad(i, -1)} disabled={ocupado}><Text style={e.pasoTexto}>−</Text></Pressable>
                      <Pressable style={e.paso} onPress={() => cambiarCantidad(i, 1)} disabled={ocupado}><Text style={e.pasoTexto}>+</Text></Pressable>
                    </View>
                    {(productoDe(i.producto_id)?.grupos.length ?? 0) > 0 && (
                      <Pressable onPress={() => setEditandoExtras(i)} hitSlop={8}><Text style={e.enlace}>Cambiar extras</Text></Pressable>
                    )}
                    {recetaDe(i.producto_id).length > 0 && (
                      <Pressable onPress={() => setAjustando(i)} hitSlop={8}><Text style={e.enlace}>Ingredientes</Text></Pressable>
                    )}
                  </>
                ) : !i.pagado && i.estado !== 'cancelado' ? (
                  <Pressable onPress={() => pedirCancelar(i)} hitSlop={8}><Text style={e.quitar}>Cancelar</Text></Pressable>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />

      <View style={e.totales}>
        <Text style={e.suave}>{ticket?.nombre} · por cobrar</Text>
        <Text style={e.total}>{dinero(ticket?.por_cobrar ?? 0)}</Text>
      </View>
      {descuento ? (
        <Pressable onPress={() => setDescuento(null)}>
          <Text style={e.descuento}>Descuento {descuento}% en el próximo cobro · tocar para quitar</Text>
        </Pressable>
      ) : null}
      {seleccion.length > 0 && <Text style={e.seleccion}>{seleccion.length} seleccionado(s) · usa «Más» para moverlos, entregarlos o cobrarlos</Text>}

      <View style={e.acciones}>
        <Boton estilo={{ flex: 1 }} titulo={`Enviar (${orden.totales.por_enviar})`} onPress={() => enviar()} deshabilitado={orden.totales.por_enviar === 0 || ocupado} />
        <Boton estilo={{ flex: 1 }} titulo="Cobrar" variante="exito" onPress={() => abrirCobro(false)} deshabilitado={!ticket || ticket.por_cobrar <= 0 || ocupado} />
        <Boton titulo="Más" variante="contorno" onPress={() => setMas(true)} />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={e.pantalla} edges={['top', 'left', 'right', 'bottom']}>
      <View style={e.cabecera}>
        <Boton titulo="‹ Mesas" variante="contorno" chico onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Text style={e.titulo}>{orden.terminal.nombre}</Text>
          <Text style={e.suave}>
            {orden.usuario} · {transcurrido(orden.abierta_at, ahora)}
            {pagadas.length > 0 ? ` · ${pagadas.length} cuenta(s) pagada(s)` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={e.suave}>Mesa por cobrar</Text>
          <Text style={e.totalMesa}>{dinero(orden.totales.por_cobrar)}</Text>
        </View>
      </View>

      {!ancho && (
        <View style={e.pestanas}>
          {(['productos', 'cuenta'] as Vista[]).map((v) => (
            <Pressable key={v} onPress={() => setVista(v)} style={[e.pestana, vista === v && e.pestanaActiva]}>
              <Text style={[e.pestanaTexto, vista === v && { color: C.primario }]}>
                {v === 'productos' ? 'Productos' : `Cuenta (${itemsVisibles.reduce((t, i) => t + i.cantidad, 0)}) · ${dinero(ticket?.por_cobrar ?? 0)}`}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={[e.cuerpo, ancho && { flexDirection: 'row' }]}>
        {(ancho || vista === 'productos') && <View style={{ flex: ancho ? 3 : 1 }}>{panelProductos}</View>}
        {(ancho || vista === 'cuenta') && <View style={{ flex: ancho ? 2 : 1 }}>{panelCuenta}</View>}
        <AvisosAgregado avisos={agregados.avisos} ancho={ancho} verTexto="Ver cuenta ›"
          onVer={() => { agregados.limpiar(); setVista('cuenta'); }} />
      </View>


      <ModificadoresModal producto={conExtras} grupos={catalogo?.grupos ?? []} onCerrar={() => setConExtras(null)} onAgregar={agregar} />
      <ModificadoresModal producto={editandoExtras ? productoDe(editandoExtras.producto_id) : null} grupos={catalogo?.grupos ?? []}
        inicial={editandoExtras ? { modificadores: idsModificadores(editandoExtras.modificadores), cantidad: editandoExtras.cantidad, notas: editandoExtras.notas ?? '' } : null}
        onCerrar={() => setEditandoExtras(null)} onAgregar={guardarExtras} />

      {ventanaCobrada}
      <CobroModal visible={!!cobro} titulo={`${cobro?.titulo ?? ''}${descuento ? ` (−${descuento}%)` : ''}`} total={conDescuento(cobro?.total ?? 0)} metodos={metodos}
        cobrando={cobrando} onCerrar={() => setCobro(null)} onCobrar={cobrar} />

      <Ventana visible={!!quitando} titulo="Cancelar producto" subtitulo={quitando ? `${cantidad(quitando.cantidad)} × ${quitando.descripcion} · ya se envió a ${quitando.area ?? 'la comanda'}` : ''}
        onCerrar={() => setQuitando(null)} ancho={460}
        pie={<Boton estilo={{ flex: 1 }} titulo={quitando && cuantos < quitando.cantidad ? `Cancelar ${cantidad(cuantos)}` : 'Cancelar producto'} variante="peligro" onPress={quitarEnviado} cargando={ocupado} deshabilitado={motivo.trim().length < 3} />}>
        {quitando && quitando.cantidad > 1 && Number.isInteger(quitando.cantidad) && (
          <View style={e.fila}>
            <Text style={[e.grupo, { flex: 1 }]}>¿Cuántos cancelar? (de {cantidad(quitando.cantidad)})</Text>
            <Pressable style={e.paso} onPress={() => setCuantos((c) => Math.max(1, c - 1))}><Text style={e.pasoTexto}>−</Text></Pressable>
            <Text style={e.grupo}>{cuantos}</Text>
            <Pressable style={e.paso} onPress={() => setCuantos((c) => Math.min(quitando.cantidad, c + 1))}><Text style={e.pasoTexto}>+</Text></Pressable>
          </View>
        )}
        <Campo etiqueta="Motivo" value={motivo} onChangeText={setMotivo} placeholder="El cliente cambió de opinión..." maxLength={200} />
        <Text style={e.suave}>Sale un aviso CANCELADO en su área. Pide el PIN del administrador.</Text>
      </Ventana>

      <Ventana visible={!!anulando} titulo={`Anular comanda #${anulando?.numero ?? ''}`} subtitulo={`${anulando?.area ?? 'General'} · se cancela lo que no se ha cobrado`}
        onCerrar={() => setAnulando(null)} ancho={460}
        pie={<Boton estilo={{ flex: 1 }} titulo="Anular comanda" variante="peligro" onPress={anularComanda} cargando={ocupado} deshabilitado={motivo.trim().length < 3} />}>
        <Campo etiqueta="Motivo" value={motivo} onChangeText={setMotivo} placeholder="Se envió a la mesa equivocada..." maxLength={200} />
        <Text style={e.suave}>Sale un aviso CANCELADO en su área. Pide el PIN del administrador.</Text>
      </Ventana>

      <IngredientesModal visible={!!ajustando} titulo={ajustando?.nombre ?? ''} receta={ajustando ? recetaDe(ajustando.producto_id) : []}
        actuales={ajustando?.ajustes ?? []} guardando={ocupado} onCerrar={() => setAjustando(null)} onGuardar={guardarAjustes} />

      <Ventana visible={pidiendoDescuento} titulo="Descuento" subtitulo="Porcentaje sobre el próximo cobro. Si pasa del máximo permitido, se pide el PIN del administrador."
        onCerrar={() => setPidiendoDescuento(false)} ancho={420}
        pie={<Boton estilo={{ flex: 1 }} titulo="Aplicar" deshabilitado={!(Number(textoDescuento) > 0 && Number(textoDescuento) <= 100)}
          onPress={() => { setDescuento(Number(textoDescuento)); setPidiendoDescuento(false); }} />}>
        <View style={e.personas}>
          {[5, 10, 15, 20, 25, 50].map((n) => (
            <Pressable key={n} onPress={() => setTextoDescuento(String(n))} style={[e.persona, textoDescuento === String(n) && e.personaActiva]}>
              <Text style={[e.personaTexto, textoDescuento === String(n) && { color: '#fff' }]}>{n}%</Text>
            </Pressable>
          ))}
        </View>
        <Campo etiqueta="Otro %" value={textoDescuento} onChangeText={(v) => setTextoDescuento(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
      </Ventana>

      <Ventana visible={liberando} titulo={`Liberar ${orden.terminal.nombre}`} subtitulo="Quedan productos sin cobrar o sin enviar: se cancelan."
        onCerrar={() => setLiberando(false)} ancho={460}
        pie={<Boton estilo={{ flex: 1 }} titulo="Liberar mesa" variante="peligro" onPress={liberar} cargando={ocupado} deshabilitado={motivo.trim().length < 3} />}>
        <Campo etiqueta="Motivo" value={motivo} onChangeText={setMotivo} placeholder="Se fueron sin consumir..." maxLength={200} />
      </Ventana>

      <Ventana visible={!!renombrando} titulo="Nombre de la cuenta" subtitulo="Por ejemplo «Juan» o «Señora de rojo». Sale en la comanda y en la precuenta."
        onCerrar={() => setRenombrando(null)} ancho={420}
        pie={<Boton estilo={{ flex: 1 }} titulo="Guardar" onPress={renombrar} cargando={ocupado} deshabilitado={!renombrando?.nombre.trim()} />}>
        <Campo etiqueta="Nombre" value={renombrando?.nombre ?? ''} onChangeText={(v) => setRenombrando((r) => r && { ...r, nombre: v })}
          maxLength={60} autoFocus selectTextOnFocus onSubmitEditing={renombrar} />
      </Ventana>

      <Ventana visible={mas} titulo="Más opciones" onCerrar={() => setMas(false)} ancho={480}>
        {seleccion.length > 0 && (
          <>
            <Text style={e.grupo}>Con lo seleccionado ({seleccion.length})</Text>
            {porEnviarSeleccion.length > 0 && (
              <Boton titulo={`Enviar solo ${porEnviarSeleccion.length === seleccion.length ? 'lo seleccionado' : `${porEnviarSeleccion.length} sin enviar`}`}
                onPress={() => enviar(porEnviarSeleccion)} />
            )}
            <Boton titulo="Cobrar solo lo seleccionado" variante="exito" onPress={() => abrirCobro(true)} />
            <Boton titulo="Marcar entregados" variante="contorno" onPress={entregarSeleccion} />
            {abiertas.filter((t) => t.id !== ticketId).map((t) => (
              <Boton key={t.id} titulo={`Mover a ${t.nombre}`} variante="contorno" onPress={() => moverA(t.id)} />
            ))}
            <Boton titulo="Mover a una cuenta nueva" variante="contorno" onPress={moverANueva} />
          </>
        )}
        <Text style={e.grupo}>Cuenta y mesa</Text>
        {ticket && !pagadaVista && (
          <Boton titulo={`Cambiar nombre de ${ticket.nombre}`} variante="contorno"
            onPress={() => { setMas(false); setRenombrando({ id: ticket.id, nombre: ticket.nombre }); }} />
        )}
        {ticket && !pagadaVista && abiertas.length > 1 && (
          <Boton titulo={`Borrar ${ticket.nombre}`} variante="peligro" onPress={borrarCuenta} />
        )}
        {abiertas.filter((t) => t.por_cobrar > 0).length > 1 && (
          <Boton titulo={`Cobrar toda la mesa · ${dinero(orden.totales.por_cobrar)}`} variante="exito" onPress={() => abrirCobro(false, true)} />
        )}
        <Boton titulo={descuento ? `Descuento ${descuento}% (cambiar)` : 'Descuento'} variante="contorno"
          onPress={() => { setMas(false); setTextoDescuento(descuento ? String(descuento) : ''); setPidiendoDescuento(true); }} />
        <Boton titulo={`Precuenta de ${ticket?.nombre ?? 'la cuenta'}`} variante="contorno" onPress={() => precuenta(ticketId)} deshabilitado={!ticket} />
        {abiertas.length > 1 && <Boton titulo="Precuenta de toda la mesa" variante="contorno" onPress={() => precuenta(null)} />}
        <Boton titulo={`Comandas enviadas (${orden.comandas.length})`} variante="contorno" onPress={() => { setMas(false); setVerComandas(true); }} />
        <Boton titulo="Cambiar de mesa" variante="contorno" onPress={elegirTraslado} />
        <Boton titulo="Liberar mesa" variante="peligro" onPress={pedirLiberar} />
      </Ventana>

      <Ventana visible={verComandas} titulo="Comandas" subtitulo="Cada área recibe su ticket impreso" onCerrar={() => setVerComandas(false)} ancho={560}>
        {orden.comandas.length === 0 && <Text style={e.suave}>Aún no se ha enviado nada.</Text>}
        {orden.comandas.map((c) => (
          <View key={c.id} style={[e.comanda, { borderLeftColor: c.color }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={e.grupo}>#{c.numero} · {c.area ?? 'General'}</Text>
              <Text style={e.suave}>{hora(c.enviada_at)} · {c.estado === 'entregada' ? 'Entregada' : c.estado === 'cancelada' ? 'Anulada' : 'Pendiente'}</Text>
            </View>
            {c.items.filter((i) => !i.cancelado).map((i) => (
              <Text key={i.id} style={e.comandaItem}>
                {cantidad(i.cantidad)} × {i.nombre}{i.modificadores.length ? ` (${i.modificadores.join(', ')})` : ''}
                {(i.ajustes ?? []).length ? <Text style={e.ajuste}>{`  ! ${i.ajustes.join(' · ')}`}</Text> : null}
              </Text>
            ))}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Boton chico estilo={{ flex: 1 }} titulo="Reimprimir" variante="contorno" onPress={async () => {
                try { const r = await srv.reimprimirComanda(c.id); avisar(r.message); } catch (err) { avisar('No se pudo imprimir', mensajeError(err)); }
              }} />
              {c.estado !== 'cancelada' && (
                <Boton chico estilo={{ flex: 1 }} titulo="Anular" variante="peligro" onPress={() => { setMotivo(''); setVerComandas(false); setAnulando(c); }} />
              )}
              {c.estado !== 'entregada' && c.estado !== 'cancelada' && (
                <Boton chico estilo={{ flex: 1 }} titulo="Entregada" variante="exito" onPress={async () => {
                  try { await srv.entregarComanda(c.id); await cargar(); } catch (err) { avisar('No se pudo marcar', mensajeError(err)); }
                }} />
              )}
            </View>
          </View>
        ))}
      </Ventana>

      <Ventana visible={!!trasladando} titulo="Cambiar de mesa" subtitulo="Elige una mesa libre" onCerrar={() => setTrasladando(null)}>
        <View style={e.personas}>
          {(trasladando ?? []).map((t) => (
            <Pressable key={t.id} onPress={() => trasladar(t)} style={[e.persona, { minWidth: 120 }]}>
              <Text style={e.personaTexto}>{t.nombre}</Text>
            </Pressable>
          ))}
          {trasladando?.length === 0 && <Text style={e.suave}>No hay mesas libres.</Text>}
        </View>
      </Ventana>
    </SafeAreaView>
  );
}

// En web (vista previa) no se refresca con la pestaña oculta
const document_oculto = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

const e = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo },
  centro: { alignItems: 'center', justifyContent: 'center', padding: 16 },
  abrir: { width: '100%', maxWidth: 480, backgroundColor: '#fff', borderRadius: 20, padding: 24, gap: 14 },
  titulo: { fontSize: 22, fontWeight: '800', color: C.texto },
  suave: { color: C.suave, fontSize: 13 },
  grupo: { fontSize: 15, fontWeight: '700', color: C.texto },
  personas: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  persona: { minWidth: 64, height: 60, paddingHorizontal: 12, borderRadius: radio, borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  personaActiva: { backgroundColor: C.libre, borderColor: C.libre },
  personaTexto: { fontSize: 20, fontWeight: '700', color: C.texto },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: C.borde },
  totalMesa: { fontSize: 20, fontWeight: '800', color: C.ocupada },
  pestanas: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderColor: C.borde },
  pestana: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderColor: 'transparent' },
  pestanaActiva: { borderColor: C.primario },
  pestanaTexto: { fontSize: 15, fontWeight: '700', color: C.suave },
  cuerpo: { flex: 1, gap: 12, padding: 12 },
  panelProductos: { flex: 1, gap: 10 },
  buscar: { height: 48, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: radio, paddingHorizontal: 14, fontSize: 16, backgroundColor: '#fff', color: C.texto },
  categorias: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 16, height: 44, justifyContent: 'center', borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: C.borde },
  chipActivo: { backgroundColor: C.texto, borderColor: C.texto },
  chipTexto: { fontWeight: '600', color: C.texto },
  producto: { flex: 1, minHeight: 92, backgroundColor: '#fff', borderRadius: radio, padding: 12, justifyContent: 'space-between', borderTopWidth: 5, borderWidth: 1, borderColor: C.borde },
  productoNombre: { fontSize: 15, fontWeight: '700', color: C.texto },
  productoPrecio: { fontSize: 16, fontWeight: '800', color: C.primario },
  panelCuenta: { flex: 1, backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 10, gap: 8 },
  cuentas: { gap: 8, paddingBottom: 2 },
  cuenta: { width: 116, borderRadius: radio, borderWidth: 2, borderColor: 'transparent', backgroundColor: '#fff', overflow: 'hidden' },
  cuentaActiva: { borderColor: C.texto },
  cuentaCabecera: { paddingHorizontal: 8, paddingVertical: 6, alignItems: 'center' },
  cuentaCuerpo: { paddingHorizontal: 8, paddingVertical: 6, alignItems: 'center', backgroundColor: '#F9FAFB' },
  cuentaNombre: { fontWeight: '700', color: '#fff' },
  cuentaMonto: { fontSize: 16, fontWeight: '800', color: C.texto },
  cuentaEstado: { fontSize: 12, color: C.suave },
  cuentaNueva: { alignItems: 'center', justifyContent: 'center', borderColor: C.borde, borderStyle: 'dashed', width: 90 },
  cuentaMas: { fontSize: 26, fontWeight: '700', color: C.libre },
  cuentaNuevaTexto: { fontWeight: '700', color: C.libre },
  avisoPagada: { padding: 10, borderRadius: radio, backgroundColor: '#DCFCE7' },
  avisoPagadaTexto: { color: '#166534', fontWeight: '600' },
  linea: { flexDirection: 'row', gap: 10, padding: 10, borderRadius: radio, borderWidth: 1, borderColor: C.borde },
  lineaElegida: { borderColor: C.primario, backgroundColor: '#EFF6FF' },
  lineaNombre: { fontSize: 15, fontWeight: '600', color: C.texto },
  lineaMonto: { fontSize: 15, fontWeight: '700', color: C.texto },
  nota: { fontSize: 13, color: C.aviso, fontStyle: 'italic' },
  pasos: { flexDirection: 'row', gap: 6 },
  paso: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  pasoTexto: { fontSize: 22, fontWeight: '700', color: C.texto },
  quitar: { color: C.peligro, fontWeight: '600', fontSize: 13 },
  enlace: { color: C.primario, fontWeight: '700', fontSize: 13 },
  ajuste: { fontSize: 13, fontWeight: '700', color: C.peligro },
  descuento: { fontSize: 13, fontWeight: '700', color: C.exito, textAlign: 'right' },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  totales: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderColor: C.borde },
  total: { fontSize: 24, fontWeight: '800', color: C.texto },
  seleccion: { fontSize: 13, color: C.primario },
  acciones: { flexDirection: 'row', gap: 8 },
  comanda: { borderWidth: 1, borderColor: C.borde, borderLeftWidth: 5, borderRadius: radio, padding: 12, gap: 6 },
  comandaItem: { fontSize: 15, color: C.texto },
});
