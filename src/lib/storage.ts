// Datos que la tablet recuerda entre usos (servidor, sesión, caja del dispositivo).
// En Android/iOS van cifrados con SecureStore; en web (vista previa) ver storage.web.ts.
import * as SecureStore from 'expo-secure-store';

export const leer = (clave: string): Promise<string | null> => SecureStore.getItemAsync(clave);

export const guardar = (clave: string, valor: string): Promise<void> => SecureStore.setItemAsync(clave, valor);

export const borrar = (clave: string): Promise<void> => SecureStore.deleteItemAsync(clave);
