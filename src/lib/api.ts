// Cliente de la API del POS (Laravel + Sanctum). El servidor y el token los fija la sesión.
import { pedirAutorizacion } from './autorizacion';

let servidor = '';
let token: string | null = null;
let alSesionVencida: (() => void) | null = null;

export const configurarApi = (opciones: { servidor?: string; token?: string | null; alSesionVencida?: () => void }) => {
  if (opciones.servidor !== undefined) servidor = normalizarServidor(opciones.servidor);
  if (opciones.token !== undefined) token = opciones.token;
  if (opciones.alSesionVencida) alSesionVencida = opciones.alSesionVencida;
};

// "192.168.1.4:8080" → "http://192.168.1.4:8080/api"
export const normalizarServidor = (valor: string): string => {
  let url = valor.trim().replace(/\/+$/, '');
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  if (!/\/api$/i.test(url)) url = `${url}/api`;
  return url;
};

/** Error de la API con su estado HTTP y la respuesta (status, permiso, errors...). */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly estado: number,
    public readonly datos: Record<string, unknown> | null,
  ) {
    super(message);
  }

  /** No llegó al servidor (apagado, Wi-Fi, IP equivocada). */
  get sinConexion(): boolean {
    return this.estado === 0;
  }
}

const primerError = (datos: Record<string, unknown> | null): string | null => {
  const errores = datos?.errors as Record<string, string[]> | undefined;
  const primero = errores ? Object.values(errores)[0]?.[0] : null;
  return primero ?? (typeof datos?.message === 'string' ? datos.message : null);
};

// Después de guardar algo (venta, comanda, cobro…) puede haber tickets nuevos en la cola de
// impresión de la tablet: quien se registre aquí la revisa de inmediato.
let trasEscribir: (() => void) | null = null;
export const alEscribir = (fn: (() => void) | null) => { trasEscribir = fn; };

export async function peticion<T>(metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', ruta: string, cuerpo?: unknown, tiempo = 15000): Promise<T> {
  if (!servidor) throw new ApiError('Configura la dirección del servidor', 0, null);

  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), tiempo);

  let respuesta: Response;
  try {
    respuesta = await fetch(`${servidor}${ruta}`, {
      method: metodo,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: control.signal,
    });
  } catch {
    throw new ApiError('No hay conexión con el servidor. Revisa el Wi-Fi o la dirección.', 0, null);
  } finally {
    clearTimeout(temporizador);
  }

  const datos = (await respuesta.json().catch(() => null)) as Record<string, unknown> | null;

  if (!respuesta.ok) {
    // Hace falta el permiso del administrador: se pide su PIN y se repite la misma petición
    if (respuesta.status === 403 && datos?.status === 'SIN_PERMISO' && metodo !== 'GET') {
      const codigo = await pedirAutorizacion({ mensaje: primerError(datos) ?? 'Esta acción necesita autorización', invalido: !!datos?.invalido });
      if (codigo) {
        const base = cuerpo && typeof cuerpo === 'object' ? cuerpo : {};
        return peticion<T>(metodo, ruta, { ...base, autorizacion: codigo }, tiempo);
      }
    }
    if (respuesta.status === 401 && token) alSesionVencida?.();
    const mensaje = respuesta.status === 401 && token
      ? 'La sesión venció: vuelve a entrar'
      : primerError(datos) ?? `Error del servidor (${respuesta.status})`;
    throw new ApiError(mensaje, respuesta.status, datos);
  }

  if (metodo !== 'GET' && !ruta.startsWith('/impresion/cola') && !ruta.endsWith('/resultado')) trasEscribir?.();
  return datos as T;
}

export const api = {
  get: <T>(ruta: string) => peticion<T>('GET', ruta),
  post: <T>(ruta: string, cuerpo: unknown = {}, tiempo?: number) => peticion<T>('POST', ruta, cuerpo, tiempo),
  put: <T>(ruta: string, cuerpo: unknown = {}) => peticion<T>('PUT', ruta, cuerpo),
  patch: <T>(ruta: string, cuerpo: unknown = {}) => peticion<T>('PATCH', ruta, cuerpo),
  delete: <T>(ruta: string) => peticion<T>('DELETE', ruta),
};

export const mensajeError = (error: unknown, porDefecto = 'Ocurrió un error'): string =>
  error instanceof Error && error.message ? error.message : porDefecto;
