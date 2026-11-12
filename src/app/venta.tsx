import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AvisosAgregado, useAvisosAgregado } from '@/components/avisosAgregado';
import { BuscarCliente } from '@/components/clientes';
import { CobroModal, Pago } from '@/components/cobro';
import { Encabezado } from '@/components/encabezado';
import { IngredientesModal } from '@/components/ingredientes';
import { ModificadoresModal } from '@/components/modificadores';
import { PedidosMostrador } from '@/components/pedidosMostrador';
import { Boton, Campo, Cargando, Ventana } from '@/components/ui';
import { VentaCobrada, VentaCobradaDatos } from '@/components/ventaCobrada';
import { C, radio } from '@/constants/colores';
import { guardarJson, leerJson } from '@/lib/almacenLocal';
import { mensajeError } from '@/lib/api';
import { avisar, confirmar } from '@/lib/aviso';
import { cantidad, dinero, nuevoUuid } from '@/lib/formato';
import * as op from '@/lib/operaciones';
import { esErrorDeRed, useConexion, VentaEnCola } from '@/lib/conexion';
import { getCatalogosCaja, getTurnoActual } from '@/lib/servicios';
import { actualizarConfiguracionImpresion, imprimirVentaOffline } from '@/lib/impresion/offline';
import { construirVentaOffline } from '@/lib/ventaOffline';
import * as almacen from '@/lib/storage';
import { useSesion } from '@/lib/sesion';
import { AjusteNuevo, AjusteReceta, ItemNuevo, MetodoPago } from '@/lib/tipos';
import { sinTildes } from '@/lib/texto';

// clave «p{id}»: el producto tal cual (tocarlo otra vez suma 1). Con extras, ingredientes
// cambiados o nota, la línea es única y el precio lleva los extras
interface Linea {
  clave: string; producto: op.ProductoPos; cantidad: number; precio: number;
  modificadores: number[]; extras: string[]; ajustes: AjusteReceta[]; notas?: string;
}

const simple = (p: op.ProductoPos) => `p${p.id}`;
// «sin Huevo», «Huevo: 3 (lleva 2)», como en la mesa
const textoAjuste = (a: AjusteReceta) => {
  const u = a.unidad && a.unidad !== 'u' ? ` ${a.unidad}` : '';
  return a.cantidad <= 0 ? `sin ${a.nombre}` : `${a.nombre}: ${cantidad(a.cantidad)}${u} (lleva ${cantidad(a.base)}${u})`;
};
// La venta en curso sigue ahí al salir al menú y volver (y si la app se cierra)
const CLAVE_CARRITO = 'venta_rapida_carrito';
type LineaGuardada = Omit<Linea, 'producto' | 'precio'> & { producto_id: number };
let enMemoria: Linea[] = [];

// Última copia de lo que hace falta para vender sin servidor
const CACHE = { catalogo: 'pos_cache_catalogo', metodos: 'pos_cache_metodos', turno: (caja: number) => `pos_cache_turno_${caja}` };
type Catalogo = Awaited<ReturnType<typeof op.getCatalogoPos>>;

const detalleDe = (l: Linea) => [...l.extras, ...l.ajustes.map(textoAjuste)].join(', ');
type Vista = 'productos' | 'carrito';

// Venta de mostrador sin mesa: el ticket y las comandas por área salen al cobrar
export default function VentaRapida() {
  const { cajaId, puede, usuario } = useSesion();
  const { enLinea, encolar, reportarErrorDeRed } = useConexion();
  // Turno abierto de esta caja (para registrar las ventas hechas sin conexión en él)
  const turnoId = useRef<number | null>(null);
  // Última venta guardada sin conexión, para «Imprimir otra vez» desde la tablet
  const [ultimaOffline, setUltimaOffline] = useState<VentaEnCola | null>(null);
  const verExistencias = puede('pos.ver_existencias');
  const { width } = useWindowDimensions();
  const ancho = width >= 900;

  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [metodos, setMetodos] = useState<MetodoPago[]>([]);
  const [lineas, setLineas] = useState<Linea[]>(enMemoria);
  const restaurado = useRef(enMemoria.length > 0);
  const [categoria, setCategoria] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [cobrando, setCobrando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [vista, setVista] = useState<Vista>('productos');
  const [ultima, setUltima] = useState<Pick<op.VentaDetalle, 'numero' | 'total' | 'cambio'> | null>(null);
  const [cobrada, setCobrada] = useState<VentaCobradaDatos | null>(null);
  const [conExtras, setConExtras] = useState<op.ProductoPos | null>(null);
  // Línea que se está editando (tocarla en el carrito reabre sus extras, cantidad y nota)
  const [editando, setEditando] = useState<Linea | null>(null);
  const [ajustando, setAjustando] = useState<Linea | null>(null);
  const uuid = useRef(nuevoUuid());

  // Pedidos con la comanda ya enviada que se cobran cuando el cliente recoge
  const [pedidos, setPedidos] = useState<op.PedidoMostrador[]>([]);
  const [verPedidos, setVerPedidos] = useState(false);
  const [agregandoA, setAgregandoA] = useState<op.PedidoMostrador | null>(null);
  const [pidiendoNombre, setPidiendoNombre] = useState(false);
  const [nombreCliente, setNombreCliente] = useState('');
  const [enviando, setEnviando] = useState(false);
  const uuidPedido = useRef(nuevoUuid());
  // Descuento general en %, como en la mesa: si pasa del máximo, el servidor pide el PIN
  const [descuento, setDescuento] = useState<number | null>(null);
  const [pidiendoDescuento, setPidiendoDescuento] = useState(false);
  const [textoDescuento, setTextoDescuento] = useState('');
  // Cliente de la venta (se elige con «Agregar cliente» o viene del encargo) y el encargo (solo se cobra lo que falta del anticipo)
  const [cliente, setCliente] = useState<op.Cliente | null>(null);
  const [eligiendoCliente, setEligiendoCliente] = useState(false);
  const [encargo, setEncargo] = useState<op.PedidoEspecial | null>(null);
  const { pedido: pedidoParam } = useLocalSearchParams<{ pedido?: string }>();

  const cargarPedidos = useCallback(() => {
    if (!cajaId) return;
    op.getPedidosMostrador(cajaId).then((r) => setPedidos(r.pedidos)).catch(() => null);
  }, [cajaId]);
  useEffect(() => {
    cargarPedidos();
    const t = setInterval(cargarPedidos, 30 * 1000);
    return () => clearInterval(t);
  }, [cargarPedidos]);

  // Con conexión se guarda una copia del catálogo, las formas de pago y el turno; sin conexión se usa esa copia
  const cargarCatalogo = useCallback(() => {
    op.getCatalogoPos()
      .then((c) => { setCatalogo(c); guardarJson(CACHE.catalogo, c).catch(() => null); })
      .catch(async (err) => {
        const copia = esErrorDeRed(err) ? await leerJson<Catalogo>(CACHE.catalogo) : null;
        if (copia) {
          reportarErrorDeRed();
          setCatalogo((actual) => actual ?? copia);
        } else {
          avisar('No se pudo cargar el catálogo', esErrorDeRed(err)
            ? `${mensajeError(err)}\nPara vender sin conexión, abre Venta rápida una vez con conexión.`
            : mensajeError(err));
        }
      });
  }, [reportarErrorDeRed]);

  useEffect(() => {
    cargarCatalogo();
    getCatalogosCaja()
      .then((c) => { setMetodos(c.metodos_pago); guardarJson(CACHE.metodos, c.metodos_pago).catch(() => null); })
      .catch(async () => setMetodos((await leerJson<MetodoPago[]>(CACHE.metodos)) ?? []));
  }, [cargarCatalogo]);

  useEffect(() => {
    if (!cajaId) return;
    actualizarConfiguracionImpresion(cajaId); // datos para imprimir sin servidor
    getTurnoActual(cajaId)
      .then((r) => { turnoId.current = r.turno?.id ?? null; guardarJson(CACHE.turno(cajaId), { id: turnoId.current }).catch(() => null); })
      .catch(async () => { turnoId.current = (await leerJson<{ id: number | null }>(CACHE.turno(cajaId)))?.id ?? null; });
  }, [cajaId]);

  // Al abrir con la app recién iniciada, recupera la venta guardada con los datos actuales del catálogo
  useEffect(() => {
    if (!catalogo || restaurado.current) return;
    restaurado.current = true;
    almacen.leer(CLAVE_CARRITO).then((texto) => {
      if (!texto) return;
      const guardadas: LineaGuardada[] = JSON.parse(texto);
      const opciones = (catalogo.grupos ?? []).flatMap((g) => g.opciones);
      const recuperadas = guardadas.flatMap(({ producto_id, ...l }) => {
        const producto = catalogo.productos.find((p) => p.id === producto_id);
        if (!producto) return [];
        const extra = opciones.reduce((t, o) => t + o.precio * l.modificadores.filter((id) => id === o.id).length, 0);
        return [{ ...l, producto, precio: Math.round((producto.precio + extra) * 100) / 100 }];
      });
      setLineas((actuales) => (actuales.length ? actuales : recuperadas));
    }).catch(() => null);
  }, [catalogo]);

  useEffect(() => {
    enMemoria = lineas;
    if (!restaurado.current) return;
    const guardar: LineaGuardada[] = lineas.map(({ producto, precio: _precio, ...l }) => ({ ...l, producto_id: producto.id }));
    (guardar.length ? almacen.guardar(CLAVE_CARRITO, JSON.stringify(guardar)) : almacen.borrar(CLAVE_CARRITO)).catch(() => null);
  }, [lineas]);

  useEffect(() => {
    if (!catalogo || !pedidoParam) return;
    const id = Number(pedidoParam);
    router.setParams({ pedido: undefined });
    op.getPedidoEspecial(id).then(async (p) => {
      if (p.estado !== 'abierto') return avisar(`El pedido ${p.numero} ya no está pendiente`);
      const faltan = p.items.filter((i) => !catalogo.productos.some((x) => x.id === i.producto_id));
      if (faltan.length) return avisar('No se puede cargar el pedido', `Ya no se venden: ${faltan.map((i) => i.nombre).join(', ')}`);
      if (enMemoria.length && !(await confirmar('Cargar el pedido', 'Se reemplaza la venta que está en pantalla.', 'Cargar'))) return;
      setLineas(p.items.map((i, n) => {
        const producto = catalogo.productos.find((x) => x.id === i.producto_id)!;
        return { clave: `e${p.id}-${n}`, producto, cantidad: i.cantidad, precio: producto.precio,
          modificadores: [], extras: [], ajustes: [], notas: i.notas ?? undefined };
      }));
      setEncargo(p);
      setDescuento(null);
      if (p.cliente_id) op.getCliente(p.cliente_id).then((r) => setCliente(r.cliente)).catch(() => null);
      setVista('carrito');
    }).catch((err) => avisar('No se pudo cargar el pedido', mensajeError(err)));
  }, [catalogo, pedidoParam]);

  const productos = useMemo(() => {
    const t = sinTildes(busqueda.trim());
    return (catalogo?.productos ?? []).filter((p) =>
      (!categoria || p.categorias.includes(categoria)) &&
      (!t || sinTildes(p.nombre).includes(t) || p.sku?.toLowerCase() === t || p.codigo_barras === t));
  }, [catalogo, categoria, busqueda]);

  const total = lineas.reduce((t, l) => t + Math.round(l.precio * l.cantidad * 100) / 100, 0);
  const piezas = lineas.reduce((t, l) => t + l.cantidad, 0);
  // Igual que el servidor: primero se redondea el descuento y luego se resta
  const conDescuento = descuento ? Math.round((total - Math.round(total * descuento) / 100) * 100) / 100 : total;
  // En un encargo el anticipo ya entró a la caja: solo se cobra lo que falta
  const anticipo = encargo?.anticipo ?? 0;
  const aCobrar = Math.max(0, Math.round((conDescuento - anticipo) * 100) / 100);
  const credito = cliente && cliente.limite_credito > 0 ? { cliente: cliente.nombre, disponible: cliente.credito_disponible } : null;

  // Sin stock negativo (Datos del negocio) no se agrega más de lo que hay: la existencia del
  // producto o, si sale de su receta, los platos que alcanzan con sus insumos
  // «Permitir vender sin existencia» (Coca-Cola): sin límite aunque marque 0
  const limite = (p: op.ProductoPos): number | null =>
    (p.permite_sin_existencia ? null : p.controla_stock ? (p.stock ?? 0) : (p.alcanza ?? null));
  const sinLimite = (p: op.ProductoPos) => limite(p) === null || catalogo?.permitir_stock_negativo !== false;
  const agotado = (p: op.ProductoPos) => !sinLimite(p) && (limite(p) ?? 0) <= 0;
  const cabe = (p: op.ProductoPos, nuevo: number, sinContar?: string) => {
    if (sinLimite(p)) return true;
    const enVenta = lineas.filter((l) => l.producto.id === p.id && l.clave !== sinContar).reduce((t, l) => t + l.cantidad, 0);
    const hay = limite(p) ?? 0;
    if (enVenta + nuevo <= hay + 0.0001) return true;
    const deReceta = !p.controla_stock;
    avisar(hay <= 0
      ? (deReceta ? `No alcanzan los ingredientes para ${p.nombre}` : `No hay existencia de ${p.nombre}`)
      : `${deReceta ? 'Solo alcanzan' : 'Solo hay'} ${cantidad(hay)} de ${p.nombre}`,
      enVenta > 0 ? `Ya tienes ${cantidad(enVenta)} en esta venta.` : undefined);
    return false;
  };

  // Aviso breve al agregar («✓ 1 × Americano agregado a la venta») para no tener que ir a la pestaña Venta
  const agregados = useAvisosAgregado();
  const avisarAgregado = (p: op.ProductoPos, n: number) =>
    agregados.mostrar(`✓ ${cantidad(n)} × ${p.nombre} agregado ${agregandoA ? `al pedido de ${agregandoA.nombre}` : 'a la venta'}`);

  const sumarSimple = (p: op.ProductoPos, n: number) => setLineas((ls) => {
    const existe = ls.find((l) => l.clave === simple(p));
    return existe
      ? ls.map((l) => (l.clave === simple(p) ? { ...l, cantidad: l.cantidad + n } : l))
      : [...ls, { clave: simple(p), producto: p, cantidad: n, precio: p.precio, modificadores: [], extras: [], ajustes: [] }];
  });

  // Con extras configurados (Leche, Endulzante...) primero se eligen; si no, se suma directo
  const agregar = (p: op.ProductoPos) => {
    if (!cabe(p, 1)) return;
    if (p.grupos?.length) setConExtras(p);
    else { sumarSimple(p, 1); avisarAgregado(p, 1); }
  };

  const agregarConExtras = (item: ItemNuevo) => {
    const p = conExtras;
    const previa = editando;
    setConExtras(null);
    setEditando(null);
    if (!p || !cabe(p, item.cantidad, previa?.clave)) return;
    const mods = item.modificadores ?? [];
    // Un id repetido es la opción pedida varias veces: cobra cada una y se muestra «Huevo extra ×2»
    const opciones = (catalogo?.grupos ?? []).flatMap((g) => g.opciones)
      .map((o) => ({ ...o, veces: mods.filter((id) => id === o.id).length })).filter((o) => o.veces > 0);
    const datos = {
      cantidad: item.cantidad, modificadores: mods, notas: item.notas,
      precio: Math.round((p.precio + opciones.reduce((t, o) => t + o.precio * o.veces, 0)) * 100) / 100,
      extras: opciones.map((o) => `${o.nombre}${o.veces > 1 ? ` ×${o.veces}` : ''}`),
    };
    if (previa) {
      // Se conservan los ingredientes cambiados; si queda como el producto normal, vuelve a juntarse
      const normal = !mods.length && !item.notas && !previa.ajustes.length;
      return setLineas((ls) => {
        const otraNormal = ls.some((x) => x.clave === simple(p) && x.clave !== previa.clave);
        return ls.map((l) => (l.clave === previa.clave
          ? { ...l, ...datos, clave: normal && !otraNormal ? simple(p) : l.clave === simple(p) && !normal ? nuevoUuid() : l.clave }
          : l));
      });
    }
    avisarAgregado(p, item.cantidad);
    if (!mods.length && !item.notas) return sumarSimple(p, item.cantidad);
    setLineas((ls) => [...ls, { clave: nuevoUuid(), producto: p, ajustes: [], ...datos }]);
  };

  const editarLinea = (l: Linea) => {
    setEditando(l);
    setConExtras(l.producto);
  };

  // Lo que el cliente pide distinto de la receta: mismo precio, el inventario baja solo lo que salió
  const guardarAjustes = (ajustes: AjusteNuevo[]) => {
    const linea = ajustando;
    setAjustando(null);
    if (!linea) return;
    const completos: AjusteReceta[] = ajustes.flatMap((a) => {
      const ing = linea.producto.receta.find((x) => x.producto_id === a.producto_id);
      return ing ? [{ ...ing, cantidad: a.cantidad }] : [];
    });
    // Una línea con cambios ya no se junta con el producto normal
    setLineas((ls) => ls.map((l) => (l.clave === linea.clave
      ? { ...l, ajustes: completos, clave: l.clave === simple(l.producto) && completos.length ? nuevoUuid() : l.clave }
      : l)));
  };

  const cambiar = (clave: string, delta: number) => {
    const linea = lineas.find((l) => l.clave === clave);
    if (linea && delta > 0 && !cabe(linea.producto, delta)) return;
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, cantidad: l.cantidad + delta } : l)).filter((l) => l.cantidad > 0));
  };

  const vaciar = async () => {
    if (lineas.length && await confirmar('Vaciar venta', '¿Quitar todos los productos?', 'Vaciar')) { setLineas([]); setDescuento(null); setCliente(null); setEncargo(null); }
  };

  const itemsDeVenta = () => lineas.map((l) => ({
    producto_id: l.producto.id, cantidad: l.cantidad,
    ...(l.modificadores.length ? { modificadores: l.modificadores } : {}),
    ...(l.ajustes.length ? { ajustes: l.ajustes.map((a) => ({ producto_id: a.producto_id, cantidad: a.cantidad })) } : {}),
    ...(l.notas ? { notas: l.notas } : {}),
  }));

  // Enviar comanda sin cobrar: el pedido queda en «Por cobrar» con el nombre del cliente
  const enviarPedido = async () => {
    if (!cajaId) return avisar('Elige la caja de esta tablet');
    if (encargo) return avisar('Es la entrega de un encargo', 'Cóbralo con «Cobrar»; no se envía como pedido por cobrar.');
    if (descuento) return avisar('El descuento se aplica al cobrar', 'Quítalo para enviar la comanda; al cobrar el pedido se puede descontar en la caja.');
    setEnviando(true);
    try {
      const res = agregandoA
        ? await op.agregarAPedidoMostrador(agregandoA.ticket_id, itemsDeVenta())
        : await op.crearPedidoMostrador({ uuid: uuidPedido.current, caja_id: cajaId, nombre: nombreCliente.trim(), items: itemsDeVenta() });
      uuidPedido.current = nuevoUuid();
      setLineas([]);
      setPidiendoNombre(false);
      setNombreCliente('');
      setAgregandoA(null);
      setVista('productos');
      if (res.impresion.errores.length) avisar('La comanda no se imprimió', `${res.message}\n${res.impresion.errores.join('\n')}`);
      else if (res.impresion.sin_impresora) avisar(res.message, 'No hay impresora configurada para esa área.');
      else avisar(res.message);
      cargarPedidos();
      cargarCatalogo();
    } catch (err) {
      if (esErrorDeRed(err)) reportarErrorDeRed();
      avisar('No se pudo enviar el pedido', mensajeError(err));
    } finally {
      setEnviando(false);
    }
  };

  const limpiarVenta = () => {
    setDescuento(null);
    setCliente(null);
    setEncargo(null);
    setAbierto(false);
    setLineas([]);
    setVista('productos');
    uuid.current = nuevoUuid();
  };

  // Sin servidor: la venta se guarda en la tablet (mismo uuid) y se envía sola al volver la conexión
  const venderSinConexion = async (pagos: Pago[]) => {
    if (!cajaId || !catalogo) return;
    if (encargo) return avisar('Sin conexión con el servidor', 'La entrega de un encargo necesita conexión: entrégalo cuando vuelva.');
    if (pagos.some((p) => metodos.find((m) => m.id === p.metodo_pago_id)?.tipo === 'credito')) {
      return avisar('Sin conexión con el servidor', 'La venta al crédito necesita conexión. Cobra con otra forma de pago o espera a que vuelva.');
    }
    // Sin conexión no se puede pedir el PIN del administrador
    if (descuento && !puede('pos.descuento.autorizar')) {
      return avisar('Sin conexión con el servidor', `Un descuento de ${descuento}% necesita conexión para autorizarse. Quítalo o espera a que vuelva la conexión.`);
    }

    const venta = await construirVentaOffline({
      uuid: uuid.current, cajaId, turnoId: turnoId.current, usuario: usuario?.nombre ?? null,
      descuento, pagos, metodos, clienteId: cliente?.id ?? null, clienteNombre: cliente?.nombre ?? null,
      lineas: lineas.map((l) => ({
        producto_id: l.producto.id, nombre: l.producto.nombre, unidad: l.producto.unidad, cantidad: l.cantidad, precio: l.precio,
        modificadores: l.modificadores, extras: l.extras, notas: l.notas,
        ajustes: l.ajustes.map((a) => ({ producto_id: a.producto_id, cantidad: a.cantidad })),
        textoAjustes: l.ajustes.map(textoAjuste),
      })),
    });
    await encolar(venta);
    // La tablet imprime el ticket (abre el cajón si fue en efectivo) y las comandas por área
    imprimirVentaOffline(venta, { comandas: true })
      .then((r) => { if (r.errores.length) avisar('No se imprimió todo', r.errores.join('\n')); })
      .catch((err) => avisar('No se pudo imprimir', mensajeError(err)));

    // Existencias en la tablet para no vender de más mientras no hay conexión
    const vendido = new Map<number, number>();
    lineas.forEach((l) => vendido.set(l.producto.id, (vendido.get(l.producto.id) ?? 0) + l.cantidad));
    const actualizado: Catalogo = {
      ...catalogo,
      productos: catalogo.productos.map((p) => (p.controla_stock && vendido.has(p.id) ? { ...p, stock: (p.stock ?? 0) - (vendido.get(p.id) ?? 0) } : p)),
    };
    setCatalogo(actualizado);
    guardarJson(CACHE.catalogo, actualizado).catch(() => null);

    const { numero, total, cambio } = venta.resumen;
    limpiarVenta();
    setUltima({ numero, total, cambio });
    setUltimaOffline(venta);
    setCobrada({ id: 0, numero, total, cambio, nota: 'Sin conexión: quedó guardada en esta tablet y se envía sola al volver la conexión.' });
  };

  const cobrar = async (pagos: Pago[]) => {
    if (!cajaId) return avisar('Elige la caja de esta tablet');
    setCobrando(true);
    if (!enLinea) {
      try {
        await venderSinConexion(pagos);
      } catch (err) {
        avisar('No se pudo guardar la venta', mensajeError(err));
      } finally {
        setCobrando(false);
      }
      return;
    }
    try {
      const res = await op.registrarVenta({
        uuid: uuid.current, caja_id: cajaId,
        items: itemsDeVenta(), pagos,
        descuento_global: descuento ? { tipo: 'porcentaje', valor: descuento } : null,
        cliente_id: cliente?.id ?? encargo?.cliente_id ?? null,
        pedido_id: encargo?.id ?? null,
      });
      limpiarVenta();
      setUltima(res.venta);
      setCobrada(res.venta);
      // Ticket del cliente y comandas por área; imprimir nunca frena la siguiente venta
      op.imprimirVenta(res.venta.id, cajaId, { comandas: true })
        .then((r) => { if (!r.impreso) avisar('No se imprimió todo', r.message); })
        .catch((err) => avisar('No se pudo imprimir', mensajeError(err)));
      cargarCatalogo(); // existencias al día
    } catch (err) {
      // El servidor no respondió: se guarda en la tablet con el mismo uuid (si sí llegó, no se duplica)
      if (esErrorDeRed(err)) {
        reportarErrorDeRed();
        try {
          await venderSinConexion(pagos);
        } catch (e2) {
          avisar('No se pudo guardar la venta', mensajeError(e2));
        }
      } else {
        avisar('No se pudo registrar la venta', mensajeError(err));
      }
    } finally {
      setCobrando(false);
    }
  };

  if (!catalogo) return <Cargando />;

  const panelProductos = (
    <View style={{ flex: 1, gap: 10 }}>
      <TextInput style={e.buscar} value={busqueda} onChangeText={setBusqueda} placeholder="Buscar producto o código" placeholderTextColor={C.tenue} />
      {/* Todas las categorías a la vista: pasan a otra fila si no caben */}
      <View style={e.categorias}>
        {[{ id: 0, nombre: 'Todo' }, ...catalogo.categorias].map((c) => {
          const activa = (categoria ?? 0) === c.id;
          return (
            <Pressable key={c.id} onPress={() => setCategoria(c.id || null)} style={[e.chip, activa && e.chipActivo]}>
              <Text style={[e.chipTexto, activa && { color: '#fff' }]}>{c.nombre}</Text>
            </Pressable>
          );
        })}
      </View>
      <FlatList
        data={productos}
        key={ancho ? 'a' : 'b'}
        numColumns={ancho ? 3 : 2}
        keyExtractor={(p) => String(p.id)}
        columnWrapperStyle={{ gap: 10 }}
        contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
        renderItem={({ item: p }) => (
          <Pressable onPress={() => agregar(p)} style={({ pressed }) => [e.producto, { maxWidth: ancho ? '32%' : '49%', borderTopColor: p.color ?? C.primario, opacity: agotado(p) ? 0.45 : pressed ? 0.7 : 1 }]}>
            <Text style={e.productoNombre} numberOfLines={2}>{p.nombre}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <Text style={e.productoPrecio}>{p.consumo_interno ? 'Consumo interno' : dinero(p.precio)}</Text>
              {agotado(p)
                ? <Text style={[e.suave, { color: C.peligro, fontWeight: '700' }]}>Agotado</Text>
                : p.controla_stock && verExistencias && <Text style={[e.suave, p.bajo_minimo && { color: C.peligro }]}>{cantidad(p.stock ?? 0)}</Text>}
            </View>
          </Pressable>
        )}
      />
    </View>
  );

  const panelCarrito = (
    <View style={e.carrito}>
      <View style={e.linea}>
        <Text style={e.subtitulo}>Venta actual</Text>
        {lineas.length > 0 && <Pressable onPress={vaciar} hitSlop={8}><Text style={{ color: C.peligro, fontWeight: '600' }}>Vaciar</Text></Pressable>}
      </View>
      <FlatList
        data={lineas}
        keyExtractor={(l) => l.clave}
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 8 }}
        ListEmptyComponent={<Text style={[e.suave, { textAlign: 'center', padding: 16 }]}>Toca los productos para agregarlos</Text>}
        renderItem={({ item: l }) => (
          <View style={e.item}>
            <View style={{ flex: 1, gap: 2 }}>
              <Pressable onPress={() => editarLinea(l)} hitSlop={4}>
                <Text style={e.itemNombre}>{l.producto.nombre} <Text style={e.editar}>✎</Text></Text>
              </Pressable>
              {detalleDe(l) !== '' && <Text style={e.extras}>{detalleDe(l)}</Text>}
              {l.notas && <Text style={e.suave}>Nota: {l.notas}</Text>}
              <Text style={e.suave}>{dinero(l.precio)} c/u{l.producto.area ? ` · ${l.producto.area}` : ''}</Text>
              {l.producto.receta?.length > 0 && (
                <Pressable onPress={() => setAjustando(l)} hitSlop={6} style={e.ingredientes}>
                  <Text style={e.ingredientesTexto}>{l.ajustes.length ? 'Cambiar ingredientes' : 'Ingredientes'}</Text>
                </Pressable>
              )}
            </View>
            <Pressable style={e.paso} onPress={() => cambiar(l.clave, -1)}><Text style={e.pasoTexto}>−</Text></Pressable>
            <Text style={e.numero}>{cantidad(l.cantidad)}</Text>
            <Pressable style={e.paso} onPress={() => cambiar(l.clave, 1)}><Text style={e.pasoTexto}>+</Text></Pressable>
            <Text style={e.itemTotal}>{dinero(l.precio * l.cantidad)}</Text>
          </View>
        )}
      />
      {encargo && (
        <View style={e.encargo}>
          <Text style={e.encargoTexto}>Entrega del pedido {encargo.numero}{encargo.nombre ? ` · ${encargo.nombre}` : ''}</Text>
          <Text style={e.suave}>Anticipo recibido {dinero(anticipo)} · se cobra lo que falta</Text>
        </View>
      )}
      {/* Cliente de la venta: para venderle al crédito o el ticket a su nombre. El del encargo no se cambia */}
      {!agregandoA && (cliente ? (
        <View style={e.linea}>
          <View style={{ flex: 1 }}>
            <Text style={e.cliente} numberOfLines={1}>👤 {cliente.nombre}</Text>
            <Text style={e.suave}>
              {cliente.limite_credito > 0 ? `Crédito disponible ${dinero(cliente.credito_disponible)}` : 'Sin crédito'}
              {cliente.saldo > 0 ? ` · debe ${dinero(cliente.saldo)}` : ''}
            </Text>
          </View>
          {!encargo && (
            <>
              <Pressable onPress={() => setEligiendoCliente(true)} hitSlop={6}><Text style={e.descuento}>Cambiar</Text></Pressable>
              <Pressable onPress={() => setCliente(null)} hitSlop={6}><Text style={[e.descuento, { color: C.peligro }]}>Quitar</Text></Pressable>
            </>
          )}
        </View>
      ) : !encargo && (
        <View style={e.linea}>
          <Pressable onPress={() => setEligiendoCliente(true)} hitSlop={6} style={{ flex: 1 }}>
            <Text style={e.descuento}>👤 Agregar cliente <Text style={e.suave}>· al crédito o ticket a su nombre</Text></Text>
          </Pressable>
        </View>
      ))}
      <View style={e.linea}>
        <Pressable onPress={() => { setTextoDescuento(descuento ? String(descuento) : ''); setPidiendoDescuento(true); }}
          disabled={lineas.length === 0 || !!agregandoA} hitSlop={6}>
          <Text style={[e.descuento, (lineas.length === 0 || agregandoA) && { opacity: 0.4 }]}>
            {descuento ? `Descuento ${descuento}% · cambiar` : '% Descuento'}
          </Text>
        </Pressable>
        <View style={{ alignItems: 'flex-end' }}>
          {descuento || anticipo ? <Text style={[e.suave, { textDecorationLine: 'line-through' }]}>{dinero(total)}</Text> : null}
          <Text style={e.total}>{dinero(aCobrar)}</Text>
          <Text style={e.suave}>{cantidad(piezas)} producto(s)</Text>
        </View>
      </View>
      {agregandoA ? (
        <>
          <View style={e.agregando}>
            <Text style={e.agregandoTexto}>Agregando al pedido de {agregandoA.nombre}</Text>
            <Pressable onPress={() => setAgregandoA(null)} hitSlop={8}><Text style={{ color: C.peligro, fontWeight: '700' }}>No agregar</Text></Pressable>
          </View>
          <Boton titulo={`Enviar a ${agregandoA.nombre} · ${dinero(total)}`} deshabilitado={lineas.length === 0} cargando={enviando} onPress={enviarPedido} />
        </>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Boton estilo={{ flex: 1 }} titulo="Enviar comanda" variante="contorno" deshabilitado={lineas.length === 0 || !!encargo}
            onPress={() => (enLinea ? setPidiendoNombre(true) : avisar('Sin conexión con el servidor', 'Las comandas por cobrar necesitan conexión. Puedes cobrar la venta ahora: se guarda en la tablet.'))} />
          <Boton estilo={{ flex: 1 }} titulo={`Cobrar ${dinero(aCobrar)}`} variante="exito" deshabilitado={lineas.length === 0} onPress={() => setAbierto(true)} />
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={e.pantalla} edges={['top', 'left', 'right', 'bottom']}>
      <Encabezado titulo="Venta rápida" subtitulo={ultima ? `Última: ${ultima.numero} · ${dinero(ultima.total)}${ultima.cambio > 0 ? ` · cambio ${dinero(ultima.cambio)}` : ''}` : 'Mostrador'}
        derecha={<Boton titulo={`Por cobrar (${pedidos.length})`} chico variante={pedidos.length ? 'primario' : 'contorno'}
          onPress={() => (enLinea ? (cargarPedidos(), setVerPedidos(true)) : avisar('Sin conexión con el servidor', 'Los pedidos por cobrar se ven cuando vuelva la conexión.'))} />} />

      {!ancho && (
        <View style={e.pestanas}>
          {(['productos', 'carrito'] as Vista[]).map((v) => (
            <Pressable key={v} onPress={() => setVista(v)} style={[e.pestana, vista === v && e.pestanaActiva]}>
              <Text style={[e.pestanaTexto, vista === v && { color: C.primario }]}>{v === 'productos' ? 'Productos' : `Venta · ${dinero(total)}`}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={[e.cuerpo, ancho && { flexDirection: 'row' }]}>
        {(ancho || vista === 'productos') && <View style={{ flex: ancho ? 3 : 1 }}>{panelProductos}</View>}
        {(ancho || vista === 'carrito') && <View style={{ flex: ancho ? 2 : 1 }}>{panelCarrito}</View>}
        <AvisosAgregado avisos={agregados.avisos} ancho={ancho} verTexto="Ver venta ›"
          onVer={() => { agregados.limpiar(); setVista('carrito'); }} />
      </View>

      <VentaCobrada venta={cobrada} cajaId={cajaId} onListo={() => setCobrada(null)}
        reimprimir={cobrada && !cobrada.id && ultimaOffline ? async () => {
          const r = await imprimirVentaOffline(ultimaOffline);
          if (r.errores.length) avisar('No se imprimió', r.errores.join('\n'));
        } : undefined} />
      <BuscarCliente visible={eligiendoCliente} titulo="Cliente de la venta" onCerrar={() => setEligiendoCliente(false)}
        onElegir={(c) => { setCliente(c); setEligiendoCliente(false); }} />
      <CobroModal visible={abierto} titulo={`${encargo ? `Entregar ${encargo.numero}` : 'Cobrar venta'}${descuento ? ` (−${descuento}%)` : ''}${cliente ? ` · ${cliente.nombre}` : ''}`}
        total={aCobrar} metodos={metodos} cobrando={cobrando} credito={credito}
        onCerrar={() => setAbierto(false)} onCobrar={cobrar}
        onAnular={() => { setAbierto(false); setLineas([]); setDescuento(null); setCliente(null); setEncargo(null); }} />


      <Ventana visible={pidiendoDescuento} titulo="Descuento" ancho={420} onCerrar={() => setPidiendoDescuento(false)}
        subtitulo="Porcentaje sobre esta venta. Si pasa del máximo permitido, al cobrar se pide el PIN del administrador."
        pie={
          <>
            {descuento ? <Boton estilo={{ flex: 1 }} titulo="Quitar" variante="neutro" onPress={() => { setDescuento(null); setPidiendoDescuento(false); }} /> : null}
            <Boton estilo={{ flex: 1 }} titulo="Aplicar" deshabilitado={!(Number(textoDescuento) > 0 && Number(textoDescuento) <= 100)}
              onPress={() => { setDescuento(Number(textoDescuento)); setPidiendoDescuento(false); }} />
          </>
        }>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[5, 10, 15, 20, 50, 100].map((n) => (
            <Pressable key={n} onPress={() => setTextoDescuento(String(n))} style={[e.chip, textoDescuento === String(n) && e.chipActivo]}>
              <Text style={[e.chipTexto, textoDescuento === String(n) && { color: '#fff' }]}>{n}%</Text>
            </Pressable>
          ))}
        </View>
        <Campo etiqueta="Otro %" value={textoDescuento} onChangeText={(t) => setTextoDescuento(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
      </Ventana>

      <Ventana visible={pidiendoNombre} titulo="Enviar comanda" ancho={460} onCerrar={() => setPidiendoNombre(false)}
        subtitulo="Sale a cocina o barra ahora; se cobra cuando el cliente recoja."
        pie={<Boton estilo={{ flex: 1 }} titulo={`Enviar · ${dinero(total)}`} cargando={enviando}
          deshabilitado={!nombreCliente.trim()} onPress={enviarPedido} />}>
        <Campo etiqueta="¿A nombre de quién?" value={nombreCliente} onChangeText={setNombreCliente} maxLength={60} autoFocus
          placeholder="Juan, señora de rojo, #3..." onSubmitEditing={() => nombreCliente.trim() && enviarPedido()} />
      </Ventana>

      <PedidosMostrador visible={verPedidos} cajaId={cajaId} metodos={metodos} pedidos={pedidos}
        onCerrar={() => setVerPedidos(false)} onCambio={cargarPedidos}
        onAgregarA={(p) => { setVerPedidos(false); setAgregandoA(p); setVista('productos'); }} />

      <ModificadoresModal producto={conExtras} grupos={catalogo.grupos ?? []} onAgregar={agregarConExtras}
        inicial={editando ? { modificadores: editando.modificadores, cantidad: editando.cantidad, notas: editando.notas } : null}
        onCerrar={() => { setConExtras(null); setEditando(null); }} />

      <IngredientesModal visible={!!ajustando} titulo={ajustando?.producto.nombre ?? ''} receta={ajustando?.producto.receta ?? []}
        actuales={ajustando?.ajustes ?? []} guardando={false} onCerrar={() => setAjustando(null)} onGuardar={guardarAjustes} />
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo },
  cuerpo: { flex: 1, gap: 12, padding: 12 },
  suave: { fontSize: 13, color: C.suave },
  subtitulo: { fontSize: 17, fontWeight: '700', color: C.texto },
  buscar: { height: 48, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: radio, paddingHorizontal: 14, fontSize: 16, backgroundColor: '#fff', color: C.texto },
  categorias: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 16, height: 44, justifyContent: 'center', borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: C.borde },
  chipActivo: { backgroundColor: C.texto, borderColor: C.texto },
  chipTexto: { fontWeight: '600', color: C.texto },
  producto: { flex: 1, minHeight: 92, backgroundColor: '#fff', borderRadius: radio, padding: 12, justifyContent: 'space-between', borderTopWidth: 5, borderWidth: 1, borderColor: C.borde },
  productoNombre: { fontSize: 15, fontWeight: '700', color: C.texto },
  productoPrecio: { fontSize: 16, fontWeight: '800', color: C.primario },
  carrito: { flex: 1, backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 12, gap: 10 },
  linea: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: radio, borderWidth: 1, borderColor: C.borde },
  itemNombre: { fontSize: 15, fontWeight: '600', color: C.texto },
  editar: { fontSize: 14, color: C.primario },
  agregando: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderRadius: radio, backgroundColor: '#FEF3C7' },
  agregandoTexto: { fontWeight: '700', color: '#92400E' },
  descuento: { fontSize: 14, fontWeight: '700', color: C.primario },
  cliente: { fontSize: 15, fontWeight: '700', color: C.texto },
  encargo: { padding: 10, borderRadius: radio, backgroundColor: '#EDE9FE', gap: 2 },
  encargoTexto: { fontWeight: '800', color: '#5B21B6' },
  extras: { fontSize: 13, fontWeight: '600', color: C.aviso },
  ingredientes: { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F3F4F6' },
  ingredientesTexto: { fontSize: 13, fontWeight: '700', color: C.primario },
  itemTotal: { minWidth: 70, textAlign: 'right', fontSize: 15, fontWeight: '700', color: C.texto },
  paso: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  pasoTexto: { fontSize: 22, fontWeight: '700', color: C.texto },
  numero: { minWidth: 28, textAlign: 'center', fontSize: 16, fontWeight: '700', color: C.texto },
  total: { fontSize: 26, fontWeight: '800', color: C.texto },
  pestanas: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderColor: C.borde },
  pestana: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderColor: 'transparent' },
  pestanaActiva: { borderColor: C.primario },
  pestanaTexto: { fontSize: 15, fontWeight: '700', color: C.suave },
});
