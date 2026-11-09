// Módulo nativo local (solo Android, en el APK). En Expo Go o en web no existe: devuelve null.
import { requireOptionalNativeModule } from 'expo';

interface ImpresoraTcp {
  /** Manda los bytes (en base64) a host:puerto. Rechaza si no conecta o se corta. */
  enviar(host: string, puerto: number, base64: string, tiempoMs: number): Promise<number>;
}

export const impresoraTcp = requireOptionalNativeModule<ImpresoraTcp>('ImpresoraTcp');
