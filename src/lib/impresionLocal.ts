// La tablet imprime: con el servidor en la nube, las impresoras con conexión «dispositivo»
// no las alcanza el servidor. Él arma el ticket (las Star ya como imagen) y lo deja en una
// cola; todas las tablets con sesión la revisan y la primera que toma un trabajo lo manda por
// el Wi-Fi del local al puerto 9100 de la impresora (el servidor lo aparta para que no salga doble).
// Siempre activo: las tablets del negocio no salen del local.
//
// Usa el módulo nativo local modules/impresora-tcp: funciona en el APK (build de EAS),
// no en Expo Go ni en la vista web.
import { impresoraTcp } from '../../modules/impresora-tcp';

import { api, mensajeError } from './api';
import { aBase64 } from './impresion/documento';
import { avisar } from './aviso';
import { guardar, leer } from './storage';

const K = { dispositivo: 'pos_dispositivo' };

interface TrabajoCola { id: number; tipo: string; impresora: string; ip: string; puerto: number; bytes: string }

let dispositivo = '';
let ocupado = false;
let repetir = false;
let ultimoAviso = 0;

/** ¿El APK trae el módulo de red? (Expo Go y la web no). */
export const puedeImprimir = (): boolean => !!impresoraTcp;

/** Identificador de esta tablet para apartar los trabajos que toma de la cola. */
export async function cargarImpresionLocal(): Promise<void> {
  dispositivo = (await leer(K.dispositivo)) ?? '';
  if (!dispositivo) {
    dispositivo = `tablet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await guardar(K.dispositivo, dispositivo);
  }
}

/** Abre la conexión a la impresora, manda los bytes (o su base64) y la cierra. */
export async function enviarAImpresora(ip: string, puerto: number, datos: string | Uint8Array): Promise<void> {
  if (!impresoraTcp) throw new Error('Esta versión de la app no puede imprimir: instala el APK');
  try {
    await impresoraTcp.enviar(ip, puerto, typeof datos === 'string' ? datos : aBase64(datos), 8000);
  } catch (err) {
    throw new Error(`No se pudo conectar con la impresora ${ip}:${puerto} (${mensajeError(err, 'sin respuesta')})`);
  }
}

/**
 * Toma la cola del servidor e imprime. Si ya está trabajando, vuelve a revisar
 * al terminar (así no se pierde lo que llegó mientras tanto) y la promesa se cumple
 * cuando termina esa vuelta. silencioso: sin aviso si falla (quien llama muestra el suyo).
 */
let enCurso: Promise<void> | null = null;
let silenciar = false;

export function procesarCola(opciones: { silencioso?: boolean } = {}): Promise<void> {
  if (!dispositivo || !puedeImprimir()) return Promise.resolve();
  if (opciones.silencioso) silenciar = true;
  if (ocupado && enCurso) {
    repetir = true;
    return enCurso;
  }
  ocupado = true;
  enCurso = vuelta().finally(() => {
    ocupado = false;
    enCurso = null;
    silenciar = false;
  });
  return enCurso;
}

async function vuelta(): Promise<void> {
  try {
    do {
      repetir = false;
      const { trabajos } = await api.post<{ trabajos: TrabajoCola[] }>('/impresion/cola/tomar', { dispositivo }, 10000);
      for (const t of trabajos) {
        let error: string | null = null;
        try {
          await enviarAImpresora(t.ip, t.puerto, t.bytes);
        } catch (err) {
          error = mensajeError(err, 'No se pudo imprimir');
        }
        await api.post(`/impresion/trabajos/${t.id}/resultado`, { ok: !error, error }).catch(() => undefined);
        // Un solo aviso cada 30 s aunque fallen varios: el detalle queda en Impresiones con error
        if (error && !silenciar && Date.now() - ultimoAviso > 30000) {
          ultimoAviso = Date.now();
          avisar(`No se imprimió (${t.impresora})`, `${error}

Revisa que la impresora esté encendida y en el mismo Wi-Fi. Se reintenta en Ajustes → Impresoras → Impresiones con error, o se reimprime desde el ticket o la comanda.`);
        }
      }
      if (trabajos.length >= 10) repetir = true;
    } while (repetir);
  } catch {
    // Sin conexión con el servidor: se reintenta en la siguiente vuelta
  }
}
