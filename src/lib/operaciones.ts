// Servicios de los módulos de operación diaria: venta rápida, turno de caja, ventas,
// compras, gastos, inventario, producción, mermas y resumen del día.
import { api } from './api';
import { AjusteNuevo, GrupoModificador, IngredienteReceta, ItemOrden } from './tipos';

const consulta = (filtros: Record<string, string | number | undefined | null>) => {
  const partes = Object.entries(filtros).filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return partes.length ? `?${partes.join('&')}` : '';
};

// ── Venta rápida ──────────────────────────────────────────────
export interface ProductoPos {
  id: number; nombre: string; sku: string | null; codigo_barras: string | null; precio: number; color: string | null;
  categorias: number[]; unidad: string | null; permite_fraccion: boolean; controla_stock: boolean;
  // Lleva inventario pero se vende aunque no haya existencia (Coca-Cola)
  permite_sin_existencia?: boolean;
  consumo_interno: boolean; area: string | null; stock: number | null; bajo_minimo: boolean;
  grupos: number[]; receta: IngredienteReceta[];
  alcanza?: number | null; // platos con receta: cuántos alcanzan con los insumos (null = sin límite)
}

export const getCatalogoPos = () =>
  api.get<{
    productos: ProductoPos[]; categorias: { id: number; nombre: string }[]; grupos: GrupoModificador[];
    permitir_stock_negativo?: boolean;
  }>('/pos/catalogo');

export const registrarVenta = (datos: {
  uuid: string; caja_id: number;
  items: { producto_id: number; cantidad: number; modificadores?: number[]; ajustes?: AjusteNuevo[]; notas?: string }[];
  pagos: { metodo_pago_id: number; monto: number; referencia?: string }[];
  descuento_global?: { tipo: 'porcentaje' | 'monto'; valor: number } | null;
  cliente_id?: number | null; pedido_id?: number | null;
}) => api.post<{ message: string; venta: VentaDetalle }>('/pos/ventas', datos, 20000);

// ── Pedidos de mostrador: la comanda sale ya y se cobran después ──
export interface PedidoMostrador {
  orden_id: number; ticket_id: number; nombre: string; total: number; por_cobrar: number; piezas: number;
  creado_at: string | null; usuario: string | null; items: ItemOrden[];
}
type ItemPedido = { producto_id: number; cantidad: number; modificadores?: number[]; ajustes?: AjusteNuevo[]; notas?: string };
type ImpresionPedido = { impresas: number; errores: string[]; sin_impresora: boolean };

export const getPedidosMostrador = (cajaId: number) =>
  api.get<{ pedidos: PedidoMostrador[]; mesas_por_cobrar: string[] }>(`/mostrador/pedidos?caja_id=${cajaId}`);

export const crearPedidoMostrador = (datos: { uuid: string; caja_id: number; nombre: string; items: ItemPedido[] }) =>
  api.post<{ message: string; pedido: PedidoMostrador; impresion: ImpresionPedido }>('/mostrador/pedidos', datos, 20000);

export const agregarAPedidoMostrador = (ticketId: number, items: ItemPedido[]) =>
  api.post<{ message: string; pedido: PedidoMostrador; impresion: ImpresionPedido }>(`/mostrador/pedidos/${ticketId}/items`, { items }, 20000);

// Ticket del cliente y, en una venta nueva, las comandas por área
// Abrir el cajón sin venta: pide motivo; sin el permiso caja.abrir_cajon se pide el PIN del administrador
export const abrirCajon = (cajaId: number, motivo: string) =>
  api.post<{ impreso: boolean; message: string }>('/impresion/cajon', { caja_id: cajaId, motivo });
export const imprimirVenta = (ventaId: number, cajaId: number, opciones: { copia?: boolean; comandas?: boolean } = {}) =>
  api.post<{ impreso: boolean; message: string }>(`/impresion/ventas/${ventaId}`, { caja_id: cajaId, ...opciones });

// ── Ventas ────────────────────────────────────────────────────
export interface VentaLista {
  id: number; numero: string; fecha: string; estado: 'completada' | 'anulada' | 'devuelta'; total: number;
  productos: number; usuario: string | null; caja: string | null; turno_id: number; cliente?: string | null; pagos: string[];
}

export interface VentaDetalle {
  id: number; numero: string; estado: VentaLista['estado']; fecha: string; caja: string | null; turno_id: number;
  usuario: string | null; subtotal: number; descuento_total: number; total: number; cambio: number;
  cliente?: { id: number; nombre: string } | null; motivo_anulacion: string | null; anulada_por: string | null;
  credito?: { monto: number; saldo: number; fecha_vencimiento: string; estado: string } | null;
  anticipo_aplicado?: number;
  detalles: { id: number; nombre: string; cantidad: number; precio_unitario: number; descuento: number; subtotal: number; unidad: string | null; cantidad_devuelta: number; disponible: number }[];
  devoluciones?: { id: number; numero: string; fecha: string; total: number; motivo: string; metodo: string | null; usuario: string | null }[];
  pagos: { metodo: string | null; monto: number; recibido: number | null; cambio: number; referencia: string | null }[];
}

export const ESTADO_VENTA: Record<VentaLista['estado'], { texto: string; fondo: string; color: string }> = {
  completada: { texto: 'Completada', fondo: '#DCFCE7', color: '#166534' },
  anulada: { texto: 'Anulada', fondo: '#FEE2E2', color: '#B91C1C' },
  devuelta: { texto: 'Devuelta', fondo: '#FEF3C7', color: '#92400E' },
};

export const getVentas = (filtros: { desde?: string; hasta?: string; turno_id?: number; estado?: string; buscar?: string; page?: number; per_page?: number }) =>
  api.get<{ ventas: VentaLista[]; totales: { cantidad: number; total: number }; pagina: number; total_paginas: number }>(`/pos/ventas${consulta(filtros)}`);

export const getVenta = async (id: number) => (await api.get<{ venta: VentaDetalle }>(`/pos/ventas/${id}`)).venta;

export const anularVenta = (id: number, motivo: string) =>
  api.post<{ message: string }>(`/pos/ventas/${id}/anular`, { motivo });

// ── Turno de caja ─────────────────────────────────────────────
export interface MovimientoCaja {
  id: number; fecha: string; tipo: string; tipo_texto: string; entrada: boolean; metodo_pago: string | null; monto: number;
  concepto: string; usuario: string | null; anulado: boolean; manual: boolean;
}

export interface TurnoDetalle {
  turno: { id: number; caja: string | null; estado: 'abierto' | 'cerrado'; abierto_at: string; cerrado_at: string | null;
    usuario_apertura_id: number; usuario_apertura: string | null; usuario_cierre: string | null; fondo_inicial: number;
    efectivo_esperado: number | null; efectivo_contado: number | null; diferencia: number | null };
  resumen: {
    fondo_inicial: number; efectivo_esperado: number | null;
    totales: { ventas: number; devoluciones: number; ingresos: number; egresos: number };
    por_metodo: { metodo_pago_id: number; nombre: string; neto: number }[];
    ventas_por_usuario: { usuario_id: number; usuario: string | null; cantidad: number; total: number }[];
    por_comprar: { producto_id: number; producto: string; unidad: string | null; stock_actual: number; stock_minimo: number }[];
    consumo: { producto_id: number; producto: string; unidad: string | null; vendido: number; consumo_interno: number; costo: number }[];
  };
  movimientos: MovimientoCaja[];
  cierre_ciego: boolean;
}


export const getTurnoCaja = (cajaId: number) =>
  api.get<{ caja: { id: number; nombre: string } } & Partial<TurnoDetalle> & { turno: TurnoDetalle['turno'] | null; turno_ajeno?: boolean }>(`/caja/turno-actual?caja_id=${cajaId}`);


export const registrarMovimiento = (turnoId: number, datos: { uuid: string; tipo: 'ingreso' | 'egreso'; monto: number; concepto: string }) =>
  api.post<{ message: string }>(`/caja/turnos/${turnoId}/movimientos`, datos);

export const anularMovimiento = (id: number, motivo: string) =>
  api.post<{ message: string }>(`/caja/movimientos/${id}/anular`, { motivo });

export const cerrarTurno = (turnoId: number, datos: { efectivo_contado: number; observaciones?: string }) =>
  api.post<TurnoDetalle & { message: string }>(`/caja/turnos/${turnoId}/cerrar`, datos);

export const imprimirCierre = (turnoId: number, cajaId: number) =>
  api.post<{ impreso: boolean; message: string }>(`/impresion/turnos/${turnoId}`, { caja_id: cajaId });

// ── Compras ───────────────────────────────────────────────────
export interface Proveedor { id: number; nombre: string; dias_credito: number | null; saldo: number }
export interface ProductoCompra {
  id: number; nombre: string; sku: string | null; clase: string; unidad_medida_id: number | null; unidad: string | null;
  unidad_tipo: string | null; costo_unitario: number; controla_stock: boolean; permite_fraccion: boolean;
}
export interface Unidad { id: number; nombre: string; abreviatura: string | null; tipo: string; factor_base: number }
export interface CompraLista {
  id: number; numero: string; proveedor: string | null; fecha: string; tipo_documento: string; numero_documento: string | null;
  condicion: 'contado' | 'credito'; total: number; saldo: number; estado: string; usuario: string | null;
}

export const getProveedores = async () => (await api.get<{ proveedores: Proveedor[] }>('/compras/proveedores')).proveedores;

export const getCatalogoCompras = () => api.get<{ productos: ProductoCompra[]; unidades: Unidad[] }>('/compras/catalogo');

export const getCompras = (filtros: { desde?: string; hasta?: string; page?: number; per_page?: number }) =>
  api.get<{ compras: CompraLista[]; totales: { total: number }; pagina: number; total_paginas: number; total: number }>(`/compras${consulta(filtros)}`);

export const registrarCompra = (datos: {
  uuid: string; proveedor_id: number; fecha: string; tipo_documento: string; numero_documento?: string;
  condicion: 'contado' | 'credito'; fecha_vencimiento?: string; observaciones?: string;
  items: { producto_id: number; unidad_medida_id: number | null; cantidad: number; costo_unitario: number }[];
  pago?: { origen: 'caja' | 'externo'; caja_id?: number; metodo_pago_id?: number };
}) => api.post<{ message: string; compra: CompraLista }>('/compras', datos, 20000);

// ── Gastos ────────────────────────────────────────────────────
export interface Gasto {
  id: number; numero: string; fecha: string; categoria: string | null; descripcion: string; monto: number;
  origen: 'caja' | 'externo'; metodo: string | null; usuario?: string | null; anulado: boolean;
}

export interface CategoriaGasto { id: number; nombre: string; descripcion: string | null; activo: boolean; gastos: number }

// todas: incluye las inactivas (para administrarlas)
export const getCategoriasGasto = async (todas = false) =>
  (await api.get<{ categorias: CategoriaGasto[] }>(`/gastos/categorias${todas ? '?todas=1' : ''}`)).categorias;

export const guardarCategoriaGasto = (datos: { nombre: string; descripcion: string | null; activo: boolean }, id?: number) =>
  id ? api.put<{ message: string }>(`/gastos/categorias/${id}`, datos) : api.post<{ message: string }>('/gastos/categorias', datos);

export const getGastos = (filtros: { desde?: string; hasta?: string; page?: number; per_page?: number }) =>
  api.get<{ gastos: Gasto[]; total_monto: number; pagina: number; total_paginas: number; total: number }>(`/gastos${consulta(filtros)}`);

export const registrarGasto = (datos: {
  uuid: string; categoria_id: number; descripcion: string; monto: number; origen: 'caja' | 'externo';
  caja_id?: number; metodo_pago_id?: number; numero_documento?: string;
}) => api.post<{ message: string }>('/gastos', datos);

// ── Inventario ────────────────────────────────────────────────
export interface Existencia {
  producto_id: number; producto: string; clase: string; categorias: string[]; unidad: string | null;
  costo_unitario: number; precio_venta: number; stock_actual: number; stock_minimo: number; bajo_minimo: boolean;
}

export const getExistencias = (filtros: { buscar?: string; estado?: 'alerta' | 'sin_stock' | ''; clase?: string }) =>
  api.get<Existencia[]>(`/inventario/stock${consulta(filtros)}`);

// Reducción de inventario (salida): consumo del personal, regalías, uso en el local. Las mermas van aparte
export const reducirInventario = (datos: { fecha: string; producto_id: number; cantidad: number; motivo: string }) =>
  api.post<{ message: string; id: number }>('/inventario/entradas/registrar', {
    fecha: datos.fecha, tipo: 'salida', descripcion: datos.motivo,
    items: [{ producto_id: datos.producto_id, cantidad: datos.cantidad }],
  });

// ── Producción y mermas ───────────────────────────────────────
export interface RecetaLista { id: number; producto_id: number; producto: string | null; unidad: string | null; nombre: string; rendimiento: number; uso: 'produccion' | 'venta'; costo_unitario: number }
export interface ProduccionLista {
  id: number; numero: string; fecha: string; receta_id?: number; version?: number | null; producto: string | null; unidad: string | null;
  cantidad_planificada: number; cantidad_producida: number; rendimiento: number | null; costo_total: number; costo_unitario: number;
  estado: 'registrada' | 'anulada'; observaciones?: string | null; usuario?: string | null; turno?: string | null; motivo_anulacion?: string | null;
}
export interface ProduccionDetalle extends ProduccionLista {
  // true cuando el rol no tiene «produccion.ver_receta»: llegan sin consumos
  ingredientes_ocultos?: boolean;
  consumos?: { producto_id: number; producto: string | null; unidad: string | null; cantidad_teorica: number; cantidad_real: number; diferencia: number; costo_unitario: number; costo_total: number }[];
}
export interface ProductoProduccion { id: number; nombre: string; clase: string; unidad: string | null; controla_stock: boolean; permite_fraccion: boolean; stock: number | null; se_vende: boolean; costo_unitario: number }
export type MotivoMerma = 'vencido' | 'quemado' | 'danado' | 'otro';
export interface ResumenProduccion {
  desde: string; hasta: string;
  totales: { producciones: number; costo: number; mermas: number; costo_mermas: number };
  por_producto: { producto_id: number; producto: string; unidad: string | null; producciones: number; planificada: number; producida: number; rendimiento: number | null; costo_total: number; costo_unitario: number }[];
  consumos: { producto_id: number; producto: string; unidad: string | null; teorica: number; real: number; diferencia: number; costo: number }[];
  ingredientes_ocultos?: boolean;
  mermas: { por_motivo: { motivo: MotivoMerma; texto: string; cantidad: number; costo: number }[] };
  por_dia: { fecha: string; producciones: number; costo: number; mermas: number }[];
}

export const getRecetas = async () => (await api.get<{ recetas: RecetaLista[] }>('/produccion/recetas')).recetas;

export const getProducciones = (filtros: { desde?: string; hasta?: string }) =>
  api.get<{ producciones: ProduccionLista[] }>(`/produccion${consulta(filtros)}`);

export const getProduccion = async (id: number) => (await api.get<{ produccion: ProduccionDetalle }>(`/produccion/${id}`)).produccion;

export const registrarProduccion = (datos: {
  uuid: string; receta_id: number; fecha?: string; cantidad_producida: number; cantidad_planificada?: number; observaciones?: string;
  consumos?: { producto_id: number; cantidad_real: number }[];
}) => api.post<{ message: string; produccion: ProduccionDetalle }>('/produccion', datos, 20000);

export const getResumenProduccion = async (rango: { desde?: string; hasta?: string }) =>
  (await api.get<{ resumen: ResumenProduccion }>(`/produccion/resumen${consulta(rango)}`)).resumen;

export const getCatalogoProduccion = () =>
  api.get<{ productos: ProductoProduccion[]; motivos: Record<string, string> }>('/produccion/catalogo');

export const registrarMermas = (fecha: string, items: { uuid: string; producto_id: number; cantidad: number; motivo: string; detalle?: string }[]) =>
  api.post<{ message: string }>('/mermas', { fecha, items }, 20000);

// ── Resumen del día ───────────────────────────────────────────
export interface Panel {
  fecha: string;
  ventas: { hoy: number; tickets: number; ticket_promedio: number; ayer: number; variacion: number | null };
  por_hora: { hora: number; total: number }[];
  top_productos: { producto: string; unidad: string | null; cantidad: number; total: number }[];
  alertas: { stock_bajo: number; pedidos_hoy: number; pedidos_atrasados: number; turnos_abiertos: number };
}

export const getPanel = async () => (await api.get<{ panel: Panel }>('/panel')).panel;

// ── Notificaciones (cada usuario las suyas) ───────────────────
export interface Notificacion {
  id: number; tipo: 'stock_bajo' | 'stock_negativo'; titulo: string; mensaje: string | null; enlace: string | null;
  producto_id: number | null; leida: boolean; fecha: string; sigue_en_alerta: boolean | null;
}

export const getResumenNotificaciones = () =>
  api.get<{ no_leidas: number; recientes: Notificacion[] }>('/notificaciones/resumen');

export const getNotificaciones = (filtros: { estado?: '' | 'no_leidas' | 'leidas'; page?: number }) =>
  api.get<{ notificaciones: Notificacion[]; no_leidas: number; pagina: number; total_paginas: number; total: number }>(`/notificaciones${consulta(filtros)}`);

export const leerTodasNotificaciones = () => api.post<{ marcadas: number }>('/notificaciones/leer-todas');

export const marcarNotificacion = (id: number, leida = true) => api.patch(`/notificaciones/${id}/leer`, { leida });

export const borrarNotificacion = (id: number) => api.delete(`/notificaciones/${id}`);

export const vaciarNotificaciones = (soloLeidas: boolean) =>
  api.delete<{ borradas: number; message: string }>(`/notificaciones${soloLeidas ? '?solo=leidas' : ''}`);

// "ahora", "hace 5 min", "hace 2 h", "ayer", "03-11-2026"
export const haceCuanto = (iso: string): string => {
  const seg = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seg < 60) return 'ahora';
  if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
  if (seg < 172800) return 'ayer';
  const f = new Date(iso);
  return `${String(f.getDate()).padStart(2, '0')}-${String(f.getMonth() + 1).padStart(2, '0')}-${f.getFullYear()}`;
};

// ── Manuales de uso (el mismo contenido que la web) ─────────
export interface ManualSeccion { titulo: string; texto?: string; pasos?: string[]; puntos?: string[] }
export interface Manual {
  id: string;
  titulo: string;
  resumen: string;
  permisos: string[];
  donde: { web?: string; tablet?: string };
  secciones: ManualSeccion[];
  ejemplos?: { titulo: string; pasos: string[] }[];
  preguntas?: { p: string; r: string }[];
  relacionados?: string[];
}
export interface ModuloManual { id: string; titulo: string; descripcion: string; manuales: Manual[] }

export const getManuales = () => api.get<{ actualizado: string | null; modulos: ModuloManual[] }>('/manuales');

// ── Anulaciones (piden motivo; si hace falta, la API pide el PIN del encargado) ──
export const anularCompra = (id: number, motivo: string) => api.post<{ message: string }>(`/compras/${id}/anular`, { motivo });
export const anularGasto = (id: number, motivo: string) => api.post<{ message: string }>(`/gastos/${id}/anular`, { motivo });
export const anularProduccion = (id: number, motivo: string) => api.post<{ message: string }>(`/produccion/${id}/anular`, { motivo });
export const anularMerma = (id: number, motivo: string) => api.post<{ message: string }>(`/mermas/${id}/anular`, { motivo });

export interface MermaLista {
  id: number; fecha: string; producto: string | null; unidad: string | null; cantidad: number; motivo_texto: string;
  detalle: string | null; costo_total: number; anulada: boolean; motivo_anulacion: string | null; usuario: string | null; turno?: string | null;
}
export const getMermas = (filtros: { desde?: string; hasta?: string }) =>
  api.get<{ mermas: MermaLista[]; total: number }>(`/mermas${consulta(filtros)}`);

// ── Proveedores y pagos ───────────────────────────────────────
export interface ProveedorFicha {
  id: number; nombre: string; nit: string | null; nrc: string | null; contacto: string | null; telefono: string | null;
  correo: string | null; direccion: string | null; dias_credito: number | null; saldo: number; notas: string | null;
  activo: boolean; vencido?: number;
}
export type ProveedorDatos = Omit<ProveedorFicha, 'id' | 'saldo' | 'vencido'>;
export interface CuentaPagar { id: number; compra: string | null; documento: string | null; fecha: string | null; monto: number; saldo: number; fecha_vencimiento: string; vencida: boolean; dias_vencida: number }
export interface PagoProveedor { id: number; numero: string; fecha: string; monto: number; origen: 'caja' | 'externo'; metodo: string | null; referencia: string | null; usuario: string | null; compras: string[]; anulado: boolean }

export const getProveedoresFicha = async (buscar = '') =>
  (await api.get<{ proveedores: ProveedorFicha[] }>(`/compras/proveedores${consulta({ buscar, estado: 'todos' })}`)).proveedores;

export const getProveedor = (id: number) =>
  api.get<{ proveedor: ProveedorFicha; resumen: { compras: number; total_comprado: number; ultima_compra: string | null; vencido: number }; pendientes: CuentaPagar[]; pagos: PagoProveedor[] }>(`/compras/proveedores/${id}`);

export const guardarProveedor = (datos: ProveedorDatos, id?: number) =>
  id ? api.put<{ message: string; proveedor: ProveedorFicha }>(`/compras/proveedores/${id}`, datos)
    : api.post<{ message: string; proveedor: ProveedorFicha }>('/compras/proveedores', datos);

export const pagarProveedor = (id: number, datos: { uuid: string; monto: number; origen: 'caja' | 'externo'; caja_id?: number; metodo_pago_id?: number; referencia?: string }) =>
  api.post<{ message: string }>(`/cuentas-pagar/proveedores/${id}/pagos`, datos);

export const anularPagoProveedor = (id: number, motivo: string) => api.post<{ message: string }>(`/cuentas-pagar/pagos/${id}/anular`, { motivo });

// ── Clientes, crédito y abonos ────────────────────────────────
export interface Cliente {
  id: number; nombre: string; documento: string | null; telefono: string | null; correo: string | null; direccion: string | null;
  limite_credito: number; dias_credito: number | null; saldo: number; credito_disponible: number; notas: string | null; activo: boolean; vencido?: number;
}
export type ClienteDatos = Omit<Cliente, 'id' | 'saldo' | 'credito_disponible' | 'vencido'>;
export interface CuentaCobrar { id: number; venta_id: number; venta: string | null; fecha: string; monto: number; saldo: number; fecha_vencimiento: string; vencida: boolean; dias_vencida: number }
export interface Abono { id: number; numero: string; fecha: string; monto: number; metodo: string | null; referencia: string | null; usuario: string | null; anulado: boolean; motivo_anulacion: string | null }

export const getClientes = (filtros: { buscar?: string; con_saldo?: number; page?: number }) =>
  api.get<{ clientes: Cliente[]; pagina: number; total_paginas: number; total: number }>(`/clientes${consulta({ per_page: 50, ...filtros })}`);

export const getCliente = (id: number) =>
  api.get<{ cliente: Cliente; resumen: { compras: number; total_comprado: number; ultima_compra: string | null; vencido: number }; pendientes: CuentaCobrar[]; abonos: Abono[] }>(`/clientes/${id}`);

export const guardarCliente = (datos: Partial<ClienteDatos>, id?: number) =>
  id ? api.put<{ message: string; cliente: Cliente }>(`/clientes/${id}`, datos) : api.post<{ message: string; cliente: Cliente }>('/clientes', datos);

export const registrarAbono = (clienteId: number, datos: { uuid: string; caja_id: number; monto: number; metodo_pago_id?: number; referencia?: string }) =>
  api.post<{ message: string }>(`/clientes/${clienteId}/abonos`, datos);

export const anularAbono = (id: number, motivo: string) => api.post<{ message: string }>(`/clientes/abonos/${id}/anular`, { motivo });

// ── Pedidos especiales (encargos) ─────────────────────────────
export interface PedidoEspecial {
  id: number; numero: string; nombre: string | null; telefono: string | null; cliente_id: number | null; cliente: string | null;
  estado: 'abierto' | 'cobrado' | 'cancelado'; total: number; anticipo: number; pendiente: number; fecha_entrega: string | null;
  observaciones: string | null; usuario: string | null; venta: { id: number; numero: string } | null; motivo_cancelacion: string | null; creado: string;
  items: { producto_id: number; nombre: string; cantidad: number; precio_unitario: number; precio_actual: number; disponible: boolean; notas: string | null }[];
  anticipos: { fecha: string; tipo: string; monto: number }[];
}

export const getPedidosEspeciales = async (filtros: { estado?: string; buscar?: string }) =>
  (await api.get<{ pedidos: PedidoEspecial[] }>(`/pedidos-especiales${consulta(filtros)}`)).pedidos;

export const getPedidoEspecial = async (id: number) => (await api.get<{ pedido: PedidoEspecial }>(`/pedidos-especiales/${id}`)).pedido;

export const crearPedidoEspecial = (datos: {
  uuid: string; caja_id?: number; cliente_id?: number | null; nombre?: string; telefono?: string; fecha_entrega: string; observaciones?: string;
  items: { producto_id: number; cantidad: number; notas?: string }[]; anticipo?: number; metodo_pago_id?: number; referencia?: string;
}) => api.post<{ message: string; pedido: PedidoEspecial }>('/pedidos-especiales', datos);

export const anticipoPedido = (id: number, datos: { caja_id: number; monto: number; metodo_pago_id?: number; referencia?: string }) =>
  api.post<{ message: string }>(`/pedidos-especiales/${id}/anticipos`, datos);

export const cancelarPedido = (id: number, datos: { motivo: string; devolver_anticipo: boolean; caja_id?: number; metodo_pago_id?: number }) =>
  api.post<{ message: string }>(`/pedidos-especiales/${id}/cancelar`, datos);

// ── Devoluciones ──────────────────────────────────────────────
export const devolverVenta = (ventaId: number, datos: {
  uuid: string; caja_id: number; motivo: string; metodo_pago_id?: number;
  items: { venta_detalle_id: number; cantidad: number; reingresa_inventario: boolean }[];
}) => api.post<{ message: string }>(`/pos/ventas/${ventaId}/devoluciones`, datos);

// ── Catálogo: productos, categorías, unidades, extras y recetas ──
export const CLASES: Record<string, string> = {
  producto_terminado: 'Producto terminado', materia_prima: 'Materia prima', reventa: 'Reventa', empaque: 'Empaque',
};

export interface ProductoTabla {
  id: number; sku: string | null; codigo_barras: string | null; nombre: string; clase: string; se_vende: boolean;
  consumo_interno: boolean; controla_stock: boolean; costo_unitario: number | string; precio_venta: number | string;
  stock_actual: number | null; activo: boolean; unidad_abrev: string | null; categorias: string[];
  color_pos?: string | null;
}

export interface ProductoEditar {
  id: number; sku: string | null; codigo_barras: string | null; nombre: string; descripcion: string | null; clase: string;
  se_vende: boolean; consumo_interno: boolean; controla_stock: boolean; permite_fraccion: boolean; imprime_comanda?: boolean;
  permite_sin_existencia?: boolean;
  costo_unitario: number | string; precio_venta: number | string; stock_actual: number; stock_minimo: number;
  orden_pos: number; color_pos: string | null; unidad_medida_id: number; activo: boolean; categorias: number[];
}

export interface ProductoGuardar {
  nombre: string; descripcion: string | null; codigo_barras: string | null; clase: string; se_vende: boolean; consumo_interno: boolean;
  controla_stock: boolean; permite_fraccion: boolean; imprime_comanda: boolean; costo_unitario: number; precio_venta: number; stock_minimo: number;
  permite_sin_existencia: boolean;
  orden_pos: number; color_pos: string | null; unidad_medida_id: number; categorias: number[]; activo?: boolean;
}

export interface Categoria { id: number; nombre: string; estado: boolean | number; area?: { id: number; nombre: string } | null }
export interface UnidadMedida { id: number; nombre: string; abreviatura: string | null; tipo: 'unidad' | 'masa' | 'volumen'; factor_base: number | string; estado: boolean | number }

export const getProductosTabla = () => api.get<ProductoTabla[]>('/productos/tabla');
export const getProductoEditar = (id: number) => api.get<ProductoEditar>(`/productos/editar/${id}`);
export const guardarProducto = (datos: ProductoGuardar, id?: number) =>
  api.post<{ message: string; id?: number }>(id ? `/productos/actualizar/${id}` : '/productos/registro', datos);

export const getCategorias = () => api.get<Categoria[]>('/admin/categorias/tabla');
export const guardarCategoria = (datos: { nombre: string; estado: boolean }, id?: number) =>
  id ? api.put<{ message: string }>(`/admin/categorias/actualizar/${id}`, datos) : api.post<{ message: string }>('/admin/categorias/nuevo', { nombre: datos.nombre });

export const getUnidades = () => api.get<UnidadMedida[]>('/admin/unidadmedida/tabla');
export const guardarUnidad = (datos: { nombre: string; abreviatura: string | null; tipo: string; factor_base: number; estado: boolean }, id?: number) =>
  id ? api.put<{ message: string }>(`/admin/unidadmedida/actualizar/${id}`, datos) : api.post<{ message: string }>('/admin/unidadmedida/nuevo', datos);

// Extras (grupos de modificadores): Leche, Endulzante... con su precio y el insumo que descuentan
export interface OpcionExtra {
  id?: number; nombre: string; precio: number; activo?: boolean;
  // Cuántas veces se puede pedir en un mismo producto (Huevo extra hasta 3); 1 = se marca o no
  maximo?: number;
  obligatorio?: boolean; exclusiva?: boolean; // siempre va / «una sola» (quita las demás del grupo)
  producto_id: number | null; insumo?: string | null; cantidad: number | null; unidad_medida_id: number | null; unidad?: string | null;
}
export interface GrupoExtra {
  id: number; nombre: string; obligatorio: boolean; multiple: boolean; activo: boolean; minimo?: number; maximo?: number | null;
  opciones: OpcionExtra[]; productos: { id: number; nombre: string }[];
}
export interface InsumoExtra { id: number; nombre: string; unidad_medida_id: number | null; unidad: string | null; tipo: string | null; clase?: string }

// Los extras propios de un producto: sus bloques en orden (Tipo de leche, Azúcar, Extras)
export interface ConjuntoExtra { id: number; producto_id: number; producto: string; bloques: GrupoExtra[] }

export const getGruposExtras = () => api.get<{
  conjuntos: ConjuntoExtra[]; grupos: GrupoExtra[];
  // conjunto_id: sus extras, si ya tiene
  productos: { id: number; nombre: string; conjunto_id: number | null }[]; insumos: InsumoExtra[];
  unidades: { id: number; nombre: string; abreviatura: string | null; tipo: string }[];
}>('/mesas/config/modificadores');

type OpcionGuardar = { id?: number; nombre: string; precio: number; maximo?: number; obligatorio: boolean; exclusiva: boolean; activo: boolean; producto_id: number | null; cantidad: number | null; unidad_medida_id: number | null };
// minimo/maximo: unidades en total del bloque, contando repeticiones (0 = opcional; null = sin tope)
export type BloqueGuardar = { id?: number; nombre: string; minimo: number; maximo: number | null; opciones: OpcionGuardar[] };

export const guardarExtrasProducto = (productoId: number, bloques: BloqueGuardar[]) =>
  api.put<{ id: number; message: string }>(`/mesas/config/productos/${productoId}/modificadores`, { bloques });
export const quitarExtrasProducto = (productoId: number) => api.delete<{ message: string }>(`/mesas/config/productos/${productoId}/modificadores`);

export const guardarGrupoExtras = (datos: {
  nombre: string;
  obligatorio: boolean;  // = minimo > 0 (para versiones anteriores)
  minimo: number;        // unidades en total del grupo, contando repeticiones (0 = opcional)
  maximo: number | null; // null = sin tope
  opciones: { id?: number; nombre: string; precio: number; maximo?: number; obligatorio: boolean; exclusiva: boolean; activo: boolean; producto_id: number | null; cantidad: number | null; unidad_medida_id: number | null }[];
  productos: number[];
}, id?: number) => id ? api.put<{ id: number; message: string }>(`/mesas/config/modificadores/${id}`, datos) : api.post<{ id: number; message: string }>('/mesas/config/modificadores', datos);


// Recetas
export interface IngredienteRecetaCosto {
  id?: number; producto_id: number; producto: string; unidad_medida_id: number; unidad: string; cantidad: number;
  merma_porcentaje: number; costo_unitario: number; costo: number;
  cantidad_base?: number; unidad_base?: string | null; controla_stock?: boolean;
}
export interface RecetaDetalle extends RecetaLista {
  version: number; activa: boolean; notas: string | null; usuario: string | null; actualizada: string;
  costo_total: number; precio_venta: number; margen: number | null;
  ingredientes: IngredienteRecetaCosto[]; ingredientes_ocultos?: boolean; versiones: { id: number; version: number; activa: boolean; actualizada: string }[];
}
export interface ProductoCatalogoProd {
  id: number; nombre: string; clase: string; se_vende: boolean; unidad_medida_id: number | null; unidad: string | null; unidad_tipo: string | null;
  costo_unitario: number; precio_venta: number; controla_stock: boolean; consumo_interno: boolean; permite_fraccion: boolean; stock: number | null;
}

export const getRecetasTodas = async () => (await api.get<{ recetas: (RecetaLista & { activa?: boolean; version?: number; margen?: number | null; precio_venta?: number })[] }>('/produccion/recetas')).recetas;
export const getReceta = async (id: number) => (await api.get<{ receta: RecetaDetalle }>(`/produccion/recetas/${id}`)).receta;
export const getCatalogoRecetas = () => api.get<{ productos: ProductoCatalogoProd[]; unidades: { id: number; nombre: string; abreviatura: string | null; tipo: string; factor_base: number }[] }>('/produccion/catalogo');
export const guardarReceta = (datos: {
  producto_id: number; nombre?: string; rendimiento: number; notas?: string;
  ingredientes: { producto_id: number; unidad_medida_id: number; cantidad: number; merma_porcentaje: number }[];
}, id?: number) => id ? api.put<{ message: string; receta: RecetaDetalle }>(`/produccion/recetas/${id}`, datos)
  : api.post<{ message: string; receta: RecetaDetalle }>('/produccion/recetas', datos);
export const activarReceta = (id: number) => api.post<{ message: string }>(`/produccion/recetas/${id}/activar`, {});

// ── Inventario: entradas, ajustes (conteo físico) y kárdex ────
// Entrada: llega producto sin compra. Ajuste: la cantidad es lo contado y el sistema corrige la diferencia
export const registrarInventario = (datos: {
  fecha: string; tipo: 'entrada' | 'salida' | 'ajuste'; descripcion?: string;
  items: { producto_id: number; cantidad: number; costo_unitario?: number }[];
}) => api.post<{ message: string }>('/inventario/entradas/registrar', datos, 20000);

export interface MovimientoKardex {
  id: number; fecha: string; tipo: string; tipo_texto: string; referencia: string | null; motivo: string | null; usuario: string | null;
  entrada: number; salida: number; saldo: number; costo_unitario: number; costo_total: number;
}
export interface Kardex {
  producto: { id: number; nombre: string; unidad: string | null; costo_unitario: number; stock_actual: number; stock_minimo: number };
  desde: string; hasta: string; saldo_inicial: number; total_entradas: number; total_salidas: number; saldo_final: number;
  movimientos: MovimientoKardex[]; pagina: number; total_paginas: number;
}
export const getKardex = (productoId: number, filtros: { desde?: string; hasta?: string; page?: number }) =>
  api.get<Kardex>(`/inventario/kardex/${productoId}${consulta({ per_page: 50, ...filtros })}`);

// ── Historial de cierres de caja ──────────────────────────────
export interface TurnoLista {
  id: number; caja: string | null; estado: 'abierto' | 'cerrado'; abierto_at: string; cerrado_at: string | null;
  usuario_apertura: string | null; usuario_cierre: string | null; fondo_inicial: number; total_ventas: number;
  total_ingresos: number; total_egresos: number; efectivo_esperado: number | null; efectivo_contado: number | null; diferencia: number | null;
}
export const getHistorialTurnos = (filtros: { desde?: string; hasta?: string; caja_id?: number; page?: number; per_page?: number }) =>
  api.get<{ turnos: TurnoLista[]; totales: { turnos: number; ventas: number; faltantes: number; sobrantes: number }; pagina?: number; total_paginas?: number }>(`/caja/turnos${consulta(filtros)}`);

// ── Mesas y cocina: áreas, categorías y terminales ────────────
export interface AreaPrep { id: number; nombre: string; color: string | null; impresora_id: number | null; activo: boolean }
export const getAreas = () => api.get<{ areas: AreaPrep[]; impresoras: { id: number; nombre: string; uso: string }[]; categorias: { id: number; nombre: string; area_preparacion_id: number | null }[] }>('/mesas/config/areas');
export const guardarArea = (datos: { nombre: string; color: string | null; impresora_id: number | null; activo: boolean }, id?: number) =>
  id ? api.put<{ message: string }>(`/mesas/config/areas/${id}`, datos) : api.post<{ message: string }>('/mesas/config/areas', datos);
export const asignarAreas = (asignaciones: { categoria_id: number; area_id: number | null }[]) =>
  api.put<{ message: string }>('/mesas/config/categorias', { asignaciones });

export interface TerminalConfig { id: number; nombre: string; tipo: 'mesa' | 'caja'; zona: string | null; capacidad: number | null; orden: number; caja_id: number | null; activo: boolean; caja: string | null; ocupada: boolean }
export const getTerminalesConfig = () => api.get<{ terminales: TerminalConfig[]; zonas: string[] }>('/mesas/config/terminales');
export const guardarTerminal = (datos: { nombre: string; tipo: string; zona: string | null; capacidad: number | null; orden: number; caja_id: number | null; activo: boolean }, id?: number) =>
  id ? api.put<{ message: string }>(`/mesas/config/terminales/${id}`, datos) : api.post<{ message: string }>('/mesas/config/terminales', datos);

// ── Negocio, cajas, formas de pago e impresoras ───────────────
export interface Negocio {
  nombre: string; razon_social: string | null; direccion: string | null; telefono: string | null; correo: string | null;
  nit: string | null; nrc: string | null; actividad_economica: string | null; tipo_establecimiento: string | null;
  moneda: string; simbolo_moneda: string; permitir_stock_negativo: boolean; descuento_max_sin_autorizacion: number | string;
  cierre_ciego: boolean; aviso_cambio?: boolean; ticket_por_comprar?: boolean; mensaje_ticket: string | null;
}
export const getNegocio = async () => (await api.get<{ data: Negocio }>('/configuracion/negocio')).data;
export const guardarNegocio = (datos: Negocio) => api.post<{ message: string }>('/configuracion/negocio', datos);

export interface CajaConfig { id: number; nombre: string; impresora_id: number | null; activo: boolean; turno_abierto: { usuario: string | null } | null }
export const getCajasConfig = () => api.get<CajaConfig[]>('/caja/cajas');
export const guardarCaja = (datos: { nombre: string; impresora_id: number | null; activo: boolean }, id?: number) =>
  id ? api.put<{ message: string }>(`/caja/cajas/${id}`, datos) : api.post<{ message: string }>('/caja/cajas', datos);

export interface MetodoConfig { id: number; nombre: string; tipo: string; afecta_efectivo: boolean; requiere_referencia: boolean; orden: number; activo: boolean }
export const getMetodosConfig = () => api.get<MetodoConfig[]>('/caja/metodos-pago');
export const guardarMetodo = (datos: Omit<MetodoConfig, 'id'>, id?: number) =>
  id ? api.put<{ message: string }>(`/caja/metodos-pago/${id}`, datos) : api.post<{ message: string }>('/caja/metodos-pago', datos);

export interface Impresora {
  id: number; alias: string; conexion: 'red' | 'windows' | 'dispositivo'; ip_impresora: string | null; puerto: number | null; nombre_windows: string | null;
  tipo_impresion: 'escpos' | 'star_raster'; ancho_caracteres: number; uso: 'ticket' | 'comanda' | 'ambos'; predeterminada: boolean; cortar_papel: boolean;
  cash_drawer: 'ninguno' | 'pin2' | 'pin5'; activo: boolean; cajas: string[]; areas: string[];
}
export type ImpresoraDatos = Omit<Impresora, 'id' | 'cajas' | 'areas'>;
export const getImpresoras = async () => (await api.get<{ data: Impresora[] }>('/admin/impresora/index')).data;
export const guardarImpresora = (datos: ImpresoraDatos, id?: number) =>
  api.post<{ message: string }>(id ? `/admin/impresora/${id}/update` : '/admin/impresora/store', datos);
export const probarImpresora = (id: number) => api.post<{ success: boolean; message: string }>(`/admin/impresora/${id}/test`, {}, 20000);
// Comanda de ejemplo (Mesa 1, Ice latte con extras) con el formato de cocina y barra
export const probarProduccion = (id: number) => api.post<{ success: boolean; message: string }>(`/admin/impresora/${id}/test-produccion`, {}, 20000);

// ── Usuarios, roles y permisos ────────────────────────────────
export interface UsuarioLista { id: number; nombre: string; correo: string; estado: boolean; rol: string; ultimo_acceso: string | null; pin_actualizado_at: string | null }
export const getUsuarios = () => api.get<UsuarioLista[]>('/admin/usuarios/tabla');
export const getRoles = async () => (await api.get<{ roles: Record<string, string> }>('/admin/roles/tabla')).roles;
export const crearUsuario = (datos: { nombre: string; email: string; password: string; rol: string }) =>
  api.post<{ message: string }>('/admin/permisos/nuevo-usuario', datos);
export const actualizarUsuario = (id: number, datos: { nombre: string; email: string; password?: string; rol: number; estado: boolean }) =>
  api.put<{ message: string }>(`/admin/actualizar/administrador/${id}`, datos);
export const borrarPinUsuario = (id: number) => api.delete<{ message: string }>(`/admin/usuarios/${id}/pin`);

export interface MatrizRol {
  rol: { id: number; nombre: string; es_admin: boolean; usuarios: number };
  modulos: { modulo: string; permisos: { nombre: string; descripcion: string; ayuda?: string | null; asignado: boolean }[] }[];
}
export const getMatrizRol = (id: number) => api.get<MatrizRol>(`/admin/roles/${id}/matriz`);
export const guardarMatrizRol = (id: number, permisos: string[]) => api.put<{ message: string }>(`/admin/roles/${id}/permisos`, { permisos });

export interface PermisosManuales {
  roles: { id: number; nombre: string; usuarios: number; ver_seccion: boolean; permisos: string[]; manuales: string[] }[];
  modulos: { id: string; titulo: string; manuales: { id: string; titulo: string; permisos: string[] }[] }[];
}
export const getPermisosManuales = () => api.get<PermisosManuales>('/manuales/permisos');
export const guardarPermisosManuales = (rolId: number, manuales: string[]) => api.put<{ message: string }>(`/manuales/permisos/${rolId}`, { manuales });
