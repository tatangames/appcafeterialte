// Venta sin conexión (igual que el POS web): si el servidor no responde, la venta se guarda en
// la tablet con un número provisional y se envía sola a /pos/sync cuando vuelve la conexión.
// El servidor la registra con su hora real y es idempotente por uuid: reenviar no duplica.
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { borrarJson, guardarJson, leerJson } from './almacenLocal';
import { ApiError, peticion } from './api';
import { avisar } from './aviso';
import { useSesion } from './sesion';
import { AjusteNuevo } from './tipos';

export interface VentaOfflinePayload {
  uuid: string;
  caja_id: number;
  turno_id: number | null;
  numero_provisional: string;
  fecha_venta: string;
  items: { producto_id: number; cantidad: number; precio_unitario: number; modificadores?: number[]; ajustes?: AjusteNuevo[]; notas?: string }[];
  descuento_global?: { tipo: 'porcentaje' | 'monto'; valor: number } | null;
  pagos: { metodo_pago_id: number; monto: number; referencia?: string }[];
  cliente_id?: number | null;
}

/** Lo que se muestra de la venta mientras espera (lista del indicador de conexión). */
export interface ResumenOffline {
  numero: string; fecha: string; total: number; cambio: number; usuario: string | null;
  lineas: { producto_id?: number; nombre: string; extras: string[]; cantidad: number; precio: number; unidad?: string | null }[];
  // Para imprimir el ticket en la tablet (ventas guardadas antes de esto no los tienen)
  subtotal?: number; descuento?: number; cliente?: string | null; condicion?: string; referencias?: string[]; efectivo?: boolean;
}

export interface VentaEnCola {
  uuid: string;
  payload: VentaOfflinePayload;
  resumen: ResumenOffline;
  creado: string;
  estado: 'pendiente' | 'error';
  error?: string;
  intentos: number;
}

interface ResultadoSync { uuid: string; estado: 'creada' | 'ya_existia' | 'error'; numero?: string; venta_id?: number; conflictos?: string[]; message?: string }

interface Conexion {
  enLinea: boolean;
  cola: VentaEnCola[];
  sincronizando: boolean;
  activo: boolean;                         // el usuario vende (pos.vender)
  encolar: (venta: VentaEnCola) => Promise<void>;
  sincronizar: () => Promise<void>;
  reportarErrorDeRed: () => void;          // una petición falló por red: pasar a «sin conexión»
}

const Contexto = createContext<Conexion | null>(null);

const COLA = 'pos_cola_ventas';
const INTERVALO_PING = 15_000;   // sin conexión: cada cuánto se pregunta si ya volvió
const INTERVALO_SYNC = 60_000;   // con ventas en cola: reintento periódico
const LOTE = 50;

export const esErrorDeRed = (error: unknown): boolean => error instanceof ApiError && error.sinConexion;

export const ping = async (): Promise<boolean> => {
  try {
    await peticion('GET', '/pos/ping', undefined, 4000);
    return true;
  } catch (error) {
    return !esErrorDeRed(error); // si respondió (aunque sea con error), hay conexión
  }
};

export function ConexionProvider({ children }: { children: ReactNode }) {
  const { usuario, puede } = useSesion();
  const activo = !!usuario && puede('pos.vender');

  const [enLinea, setEnLinea] = useState(true);
  const [cola, setCola] = useState<VentaEnCola[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  const enCurso = useRef(false);
  // Escrituras de la cola una tras otra, para no pisar el archivo
  const escritura = useRef<Promise<unknown>>(Promise.resolve());

  const leerCola = useCallback(async () => {
    const items = (await leerJson<VentaEnCola[]>(COLA)) ?? [];
    items.sort((a, b) => a.creado.localeCompare(b.creado));
    return items;
  }, []);

  const modificarCola = useCallback((cambio: (items: VentaEnCola[]) => VentaEnCola[]) => {
    const tarea = escritura.current.then(async () => {
      const nuevos = cambio(await leerCola());
      if (nuevos.length) await guardarJson(COLA, nuevos);
      else await borrarJson(COLA);
      setCola(nuevos);
    });
    escritura.current = tarea.catch(() => null);
    return tarea;
  }, [leerCola]);

  useEffect(() => { leerCola().then(setCola).catch(() => null); }, [leerCola]);

  const sincronizar = useCallback(async () => {
    if (enCurso.current || !activo) return;
    enCurso.current = true;
    setSincronizando(true);
    let creadas = 0;
    let conObservaciones = 0;
    let errores = 0;

    try {
      const items = await leerCola();
      for (let i = 0; i < items.length; i += LOTE) {
        const lote = items.slice(i, i + LOTE);
        const res = await peticion<{ resultados: ResultadoSync[] }>('POST', '/pos/sync', { ventas: lote.map((v) => v.payload) }, 30000);
        setEnLinea(true);

        const listos = new Set<string>();
        const fallidos = new Map<string, string | undefined>();
        for (const r of res.resultados) {
          if (r.estado === 'creada' || r.estado === 'ya_existia') {
            listos.add(r.uuid);
            if (r.estado === 'creada') creadas++;
            if (r.conflictos?.length) conObservaciones++;
          } else {
            errores++;
            fallidos.set(r.uuid, r.message);
          }
        }
        await modificarCola((actuales) => actuales
          .filter((v) => !listos.has(v.uuid))
          .map((v) => (fallidos.has(v.uuid) ? { ...v, estado: 'error' as const, error: fallidos.get(v.uuid), intentos: v.intentos + 1 } : v)));
      }

      if (creadas) avisar(`${creadas} venta(s) sin conexión sincronizada(s)`, conObservaciones ? `${conObservaciones} con observaciones: revísalas en el historial de ventas.` : undefined);
      if (errores) avisar(`${errores} venta(s) no se pudieron sincronizar`, 'Toca el indicador de conexión (arriba) para ver el motivo.');
    } catch (error) {
      if (esErrorDeRed(error)) setEnLinea(false);
    } finally {
      setCola(await leerCola());
      enCurso.current = false;
      setSincronizando(false);
    }
  }, [activo, leerCola, modificarCola]);

  const encolar = useCallback(
    (venta: VentaEnCola) => modificarCola((items) => [...items.filter((v) => v.uuid !== venta.uuid), venta]),
    [modificarCola],
  );

  const reportarErrorDeRed = useCallback(() => setEnLinea(false), []);

  // Al volver a la app se revisa si hay servidor
  useEffect(() => {
    if (!activo) return;
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') ping().then(setEnLinea).catch(() => null);
    });
    return () => sub.remove();
  }, [activo]);

  // Sin conexión: se pregunta al servidor cada 15 s si ya volvió
  useEffect(() => {
    if (!activo || enLinea) return;
    const t = setInterval(async () => {
      if (await ping()) setEnLinea(true);
    }, INTERVALO_PING);
    return () => clearInterval(t);
  }, [activo, enLinea]);

  // Con conexión y ventas en cola: se envían ya y luego se reintenta cada minuto
  const hayPendientes = cola.length > 0;
  useEffect(() => {
    if (!activo || !enLinea || !hayPendientes) return;
    const ya = setTimeout(sincronizar, 0);
    const t = setInterval(sincronizar, INTERVALO_SYNC);
    return () => {
      clearTimeout(ya);
      clearInterval(t);
    };
  }, [activo, enLinea, hayPendientes, sincronizar]);

  const valor = useMemo(
    () => ({ enLinea, cola, sincronizando, activo, encolar, sincronizar, reportarErrorDeRed }),
    [enLinea, cola, sincronizando, activo, encolar, sincronizar, reportarErrorDeRed],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useConexion = (): Conexion => {
  const c = useContext(Contexto);
  if (!c) throw new Error('useConexion fuera de ConexionProvider');
  return c;
};
