// Datos grandes que la tablet guarda para trabajar sin conexión: la cola de ventas pendientes y
// la última copia del catálogo, formas de pago, turno y usuario. SecureStore no sirve aquí
// (está pensado para valores pequeños), así que van como archivos JSON en la carpeta de la app.
// En web (vista previa) ver almacenLocal.web.ts.
import { File, Paths } from 'expo-file-system';

const archivo = (nombre: string) => new File(Paths.document, `${nombre}.json`);

export const leerJson = async <T>(nombre: string): Promise<T | null> => {
  try {
    const f = archivo(nombre);
    if (!f.exists) return null;
    return JSON.parse(await f.text()) as T;
  } catch {
    return null;
  }
};

export const guardarJson = async (nombre: string, valor: unknown): Promise<void> => {
  const f = archivo(nombre);
  if (!f.exists) f.create();
  await f.write(JSON.stringify(valor));
};

export const borrarJson = async (nombre: string): Promise<void> => {
  try {
    const f = archivo(nombre);
    if (f.exists) f.delete();
  } catch {
    // ya no estaba
  }
};
