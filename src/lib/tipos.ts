// Tipos de la API del POS (los mismos que usa la web en reactcafeterialte/src/types/mesas.ts)

export type TipoTerminal = 'mesa' | 'caja';
export type EstadoItem = 'pendiente' | 'enviado' | 'en_preparacion' | 'listo' | 'entregado' | 'cancelado';
export type EstadoComanda = 'pendiente' | 'en_preparacion' | 'terminada' | 'entregada' | 'cancelada';

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  roles: string[];
  permissions: string[];
  tiene_pin?: boolean;
  pin_actualizado_at?: string | null;
}

export interface TerminalMapa {
  id: number;
  nombre: string;
  tipo: TipoTerminal;
  zona: string | null;
  capacidad: number;
  caja_id: number | null;
  orden: {
    id: number;
    numero: string;
    abierta_at: string;
    comensales: number | null;
    usuario: string | null;
    tickets: string[];
    total: number;
    por_cobrar: number;
    por_enviar: number;
    listos: number;
  } | null;
}

// cantidad: cuántas veces se pidió (Huevo extra ×2); sin ella, una vez
export interface ModificadorElegido { id: number; grupo: string; opcion: string; precio: number; cantidad?: number }

// «Huevo extra ×2»
export const textoModificador = (m: Pick<ModificadorElegido, 'opcion' | 'cantidad'>) =>
  `${m.opcion}${(m.cantidad ?? 1) > 1 ? ` ×${m.cantidad}` : ''}`;

// Ids para reenviar al servidor, repitiendo los pedidos varias veces ([7, 7] = Huevo extra ×2)
export const idsModificadores = (lista: Pick<ModificadorElegido, 'id' | 'cantidad'>[]) =>
  lista.flatMap((m) => Array<number>(Math.max(1, m.cantidad ?? 1)).fill(m.id));

export interface ItemOrden {
  id: number;
  ticket_id: number;
  producto_id: number;
  nombre: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  modificadores: ModificadorElegido[];
  ajustes: AjusteReceta[];
  texto_ajustes: string[];
  notas: string | null;
  motivo_cancelacion: string | null;
  estado: EstadoItem;
  area: string | null;
  comanda: string | null;
  pagado: boolean;
  venta_id: number | null;
  usuario: string | null;
  hora: string;
}

export interface TicketOrden {
  id: number;
  nombre: string;
  estado: 'abierto' | 'pagado' | 'cancelado';
  posicion: number;
  total: number;
  por_cobrar: number;
  items: ItemOrden[];
}

export interface Comanda {
  id: number;
  numero: string;
  orden_id: number;
  terminal: string;
  area: string | null;
  color: string;
  estado: EstadoComanda;
  notas: string | null;
  usuario: string | null;
  enviada_at: string;
  entregada_at: string | null;
  items: { id: number; nombre: string; cantidad: number; modificadores: string[]; ajustes: string[]; notas: string | null; cancelado: boolean }[];
}

export interface Orden {
  id: number;
  uuid: string;
  numero: string;
  estado: 'abierta' | 'cerrada' | 'cancelada';
  terminal: { id: number; nombre: string; tipo: TipoTerminal };
  comensales: number | null;
  cliente: { id: number; nombre: string } | null;
  usuario: string | null;
  notas: string | null;
  abierta_at: string;
  tickets: TicketOrden[];
  comandas: Comanda[];
  totales: { total: number; cobrado: number; por_cobrar: number; por_enviar: number; listos: number };
}

export interface GrupoModificador {
  id: number;
  nombre: string;
  obligatorio: boolean;
  multiple: boolean;
  // agotado: su insumo (Leche entera) ya no alcanza; no se puede elegir
  // maximo: cuántas veces se puede pedir en un mismo producto (1 = se marca o no)
  // obligatorio: siempre va (no se quita); exclusiva: «una sola», al elegirla se quitan las demás del grupo
  opciones: { id: number; nombre: string; precio: number; maximo?: number; obligatorio?: boolean; exclusiva?: boolean; agotado?: boolean }[];
}

export interface ProductoMesa {
  id: number;
  nombre: string;
  sku: string | null;
  codigo_barras: string | null;
  precio: number;
  imagen: string | null;
  color: string | null;
  permite_fraccion: boolean;
  permite_sin_existencia?: boolean;
  categorias: number[];
  grupos: number[];
  stock: number | null;
  disponible?: number | null; // existencia menos lo apartado en cuentas abiertas
  bajo_minimo?: boolean;
  unidad?: string | null;
  alcanza?: number | null; // platos con receta: cuántos alcanzan con los insumos, menos lo apartado
  receta: IngredienteReceta[];
}

// Lo que lleva una unidad del plato según su receta (en la unidad del inventario)
export interface IngredienteReceta { producto_id: number; nombre: string; base: number; unidad: string | null }
// Lo que el cliente pidió distinto ("solo 1 huevo"): el precio no cambia
export interface AjusteReceta extends IngredienteReceta { cantidad: number }
export interface AjusteNuevo { producto_id: number; cantidad: number }

export interface CatalogoMesas {
  productos: ProductoMesa[];
  categorias: { id: number; nombre: string }[];
  grupos: GrupoModificador[];
  permitir_stock_negativo?: boolean;
}

export interface ItemNuevo { producto_id: number; cantidad: number; modificadores?: number[]; notas?: string; ajustes?: AjusteNuevo[] }

export interface MetodoPago {
  id: number;
  nombre: string;
  tipo: string;
  afecta_efectivo: boolean;
  requiere_referencia: boolean;
}

export interface Caja {
  id: number;
  nombre: string;
  activo: boolean;
  turno_abierto: { id: number; abierto_at: string; usuario: string | null } | null;
}

export interface Venta {
  id: number;
  numero: string;
  total: number;
  cambio: number;
  pagos?: { metodo: string | null; monto: number; recibido: number | null }[];
}

export const ESTADOS_ITEM: Record<EstadoItem, { texto: string; fondo: string; color: string }> = {
  pendiente: { texto: 'Por enviar', fondo: '#FEF3C7', color: '#92400E' },
  enviado: { texto: 'Enviado', fondo: '#DBEAFE', color: '#1E40AF' },
  en_preparacion: { texto: 'Preparando', fondo: '#E0E7FF', color: '#3730A3' },
  listo: { texto: 'Listo', fondo: '#16A34A', color: '#FFFFFF' },
  entregado: { texto: 'Entregado', fondo: '#F3F4F6', color: '#4B5563' },
  cancelado: { texto: 'Cancelado', fondo: '#FEE2E2', color: '#B91C1C' },
};
