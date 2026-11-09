// Llamadas a la API que usa la app de la tablet (mesas, caja e impresión)
import { api } from './api';
import { AjusteNuevo, Caja, CatalogoMesas, Comanda, ItemNuevo, MetodoPago, Orden, TerminalMapa, Usuario, Venta } from './tipos';

// avisos: se agregó igual, pero no alcanza la existencia (el cobro es el que lo exige)
type ConOrden = { success: number; message?: string; orden: Orden; avisos?: string[] };

// ── Sesión ────────────────────────────────────────────────────
// registrar: la tablet aún no tiene llave; el servidor la devuelve en «dispositivo» para entrar luego con PIN
export const iniciarSesion = (email: string, password: string, registrar: boolean) =>
  api.post<{ token: string; dispositivo?: string; user: { id: number; nombre: string } }>('/login',
    { email, password, device_name: 'tablet-meseros', registrar_dispositivo: registrar });
export const iniciarSesionConPin = (dispositivo: string, pin: string) =>
  api.post<{ token: string; user: { id: number; nombre: string } }>('/login-pin', { dispositivo, pin });

export const getMe = () => api.get<Usuario>('/me');

// Bloqueo de pantalla y PIN propio
export const desbloquearPantalla = (codigo: string) => api.post<{ success: number }>('/me/desbloquear', { codigo });
// Tablet bloqueada: el PIN de cualquiera abre su sesión (cambio = false si es la misma persona)
export const cambiarUsuarioConPin = (pin: string) =>
  api.post<{ success: number; cambio: boolean; usuario_id: number; token?: string }>('/me/cambiar-usuario', { pin });
export const cambiarMiPin = (datos: { password_actual: string; pin: string; pin_confirmation: string }) =>
  api.put<{ success: number; message: string; pin_actualizado_at: string }>('/me/pin', datos);

export const cerrarSesion = () => api.post('/logout');

// ── Caja ──────────────────────────────────────────────────────
export const getCatalogosCaja = () =>
  api.get<{ cajas: Caja[]; metodos_pago: MetodoPago[] }>('/caja/catalogos');

export const getTurnoActual = (cajaId: number) =>
  api.get<{ caja: { id: number; nombre: string }; turno: { id: number; usuario_apertura_id: number; usuario_apertura: string | null; abierto_at: string } | null;
    turno_ajeno?: boolean; // turno de otra persona: solo se puede cerrar
    aviso_cambio?: boolean; // Datos del negocio → «Avisar si no alcanza el cambio»
    turno_anterior?: { cerro: string | null; cerrado_at: string | null } | null;
    por_comprar?: { producto_id: number; producto: string; unidad: string | null; stock_actual: number; stock_minimo: number }[];
    // Con turno abierto: efectivo que debería haber (null con cierre ciego)
    resumen?: { efectivo_esperado: number | null } }>(
    `/caja/turno-actual?caja_id=${cajaId}`);

// El turno queda a nombre de quien inició sesión
export const abrirTurno = (cajaId: number, fondoInicial: number) =>
  api.post<{ message: string }>('/caja/turnos/abrir', { caja_id: cajaId, fondo_inicial: fondoInicial });

// ── Mesas ─────────────────────────────────────────────────────
export const getMapa = async () => (await api.get<{ terminales: TerminalMapa[] }>('/mesas/mapa')).terminales;

export const getCatalogoMesas = () => api.get<CatalogoMesas>('/mesas/catalogo');

export const getTerminal = (id: number) =>
  api.get<{ terminal: { id: number; nombre: string; tipo: string; zona: string | null; capacidad: number }; orden: Orden | null }>(`/mesas/terminales/${id}`);

export const abrirTerminal = (id: number) =>
  api.post<ConOrden>(`/mesas/terminales/${id}/abrir`, {});

export const agregarItems = (orden: number, items: ItemNuevo[], ticketId?: number | null) =>
  api.post<ConOrden>(`/mesas/ordenes/${orden}/items`, { ticket_id: ticketId ?? null, items });

export const actualizarItem = (item: number, datos: { cantidad?: number; notas?: string | null; ajustes?: AjusteNuevo[]; modificadores?: number[] }) =>
  api.put<ConOrden>(`/mesas/items/${item}`, datos);

type AvisoCocina = { impresion: { impresas: number; errores: string[] } | null };

// Sin cantidad se quita toda la línea; con cantidad solo esa parte (1 de 3 cafés)
export const quitarItem = (item: number, motivo?: string, cantidad?: number) =>
  api.post<ConOrden & AvisoCocina>(`/mesas/items/${item}/quitar`, { motivo, cantidad });

export const anularComanda = (comanda: number, motivo: string) =>
  api.post<ConOrden & AvisoCocina>(`/mesas/comandas/${comanda}/anular`, { motivo });

// itemIds: enviar solo esos productos; sin ellos, todo lo pendiente
export const enviarComanda = (orden: number, itemIds?: number[]) =>
  api.post<ConOrden & { impresion: { impresas: number; errores: string[]; sin_impresora: boolean }; comandas: Comanda[] }>(
    `/mesas/ordenes/${orden}/enviar`, itemIds ? { item_ids: itemIds } : undefined);

export const entregarItems = (orden: number, itemIds: number[]) =>
  api.post<ConOrden>(`/mesas/ordenes/${orden}/entregar`, { item_ids: itemIds });

export const renombrarTicket = (ticket: number, nombre: string) =>
  api.put<ConOrden>(`/mesas/tickets/${ticket}`, { nombre });

// Borra una cuenta abierta por error (lo sin enviar se descarta; lo enviado o cobrado no deja)
export const eliminarTicket = (ticket: number) =>
  api.delete<ConOrden & { message?: string }>(`/mesas/tickets/${ticket}`);

export const crearTicket = (orden: number, nombre?: string) =>
  api.post<ConOrden & { ticket_id: number }>(`/mesas/ordenes/${orden}/tickets`, { nombre });

export const moverItems = (orden: number, itemIds: number[], ticketId: number) =>
  api.post<ConOrden>(`/mesas/ordenes/${orden}/mover`, { item_ids: itemIds, ticket_id: ticketId });

export const imprimirPrecuenta = (orden: number, ticketId: number | null, cajaId: number | null) =>
  api.post<{ impreso: boolean; message: string }>(`/mesas/ordenes/${orden}/precuenta`, { ticket_id: ticketId, caja_id: cajaId });

export const cobrarOrden = (orden: number, datos: {
  uuid: string; caja_id: number; ticket_id?: number | null; item_ids?: number[];
  descuento_global?: { tipo: 'porcentaje' | 'monto'; valor: number } | null;
  pagos: { metodo_pago_id: number; monto: number; referencia?: string }[];
}) => api.post<ConOrden & { venta: Venta }>(`/mesas/ordenes/${orden}/cobrar`, datos, 20000);

export const cerrarOrden = (orden: number, motivo?: string) =>
  api.post<{ message: string }>(`/mesas/ordenes/${orden}/cerrar`, { motivo });

export const trasladarOrden = (orden: number, terminalId: number) =>
  api.post<ConOrden>(`/mesas/ordenes/${orden}/trasladar`, { terminal_id: terminalId });

export const entregarComanda = (id: number) => api.post<{ comanda: Comanda }>(`/mesas/comandas/${id}/entregar`);

export const reimprimirComanda = (id: number) =>
  api.post<{ impreso: boolean; message: string }>(`/mesas/comandas/${id}/imprimir`);

// ── Impresión ─────────────────────────────────────────────────
export const imprimirTicketVenta = (ventaId: number, cajaId: number) =>
  api.post<{ impreso: boolean; message: string }>(`/impresion/ventas/${ventaId}`, { caja_id: cajaId });
