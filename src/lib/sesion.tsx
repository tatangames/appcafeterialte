// Sesión de la tablet: servidor, usuario con sus permisos y caja del dispositivo.
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { borrarJson, guardarJson, leerJson } from './almacenLocal';
import { ApiError, configurarApi, normalizarServidor } from './api';
import { cambiarUsuarioConPin, cerrarSesion, desbloquearPantalla, getMe, iniciarSesion } from './servicios';
import { borrar, guardar, leer } from './storage';
import { Usuario } from './tipos';

interface Sesion {
  listo: boolean;              // ya se leyó lo guardado en el dispositivo
  servidor: string;
  usuario: Usuario | null;
  cajaId: number | null;
  fijarServidor: (valor: string) => Promise<void>;
  entrar: (email: string, password: string) => Promise<void>;
  salir: () => Promise<void>;
  fijarCaja: (id: number | null) => Promise<void>;
  puede: (permiso: string) => boolean;
  refrescarUsuario: () => Promise<void>; // vuelve a leer roles y permisos (el admin pudo cambiarlos)
  bloqueada: boolean;                     // pantalla tapada hasta que alguien ponga su PIN
  bloquear: () => Promise<void>;
  // Con PIN entra quien sea su dueño (devuelve true si cambió de persona); con contraseña, el mismo usuario
  desbloquear: (codigo: string, conContrasena: boolean) => Promise<boolean>;
}

const Contexto = createContext<Sesion | null>(null);

const K = { servidor: 'pos_servidor', token: 'pos_token', caja: 'pos_caja', bloqueo: 'pos_bloqueo' };
// Última copia del usuario con sus permisos: para abrir la app y vender sin conexión
const USUARIO = 'pos_usuario';

const recordarUsuario = (u: Usuario) => { guardarJson(USUARIO, u).catch(() => null); };

// Servidor fijo de la compilación (EXPO_PUBLIC_SERVIDOR, p. ej. en .env.production): la tablet
// lo usa directo y no muestra la pantalla para elegir servidor. Sin él (desarrollo) se pregunta.
export const SERVIDOR_FIJO = normalizarServidor(process.env.EXPO_PUBLIC_SERVIDOR ?? '');

export function SesionProvider({ children }: { children: ReactNode }) {
  const [listo, setListo] = useState(false);
  const [servidor, setServidor] = useState('');
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cajaId, setCajaId] = useState<number | null>(null);
  const [bloqueada, setBloqueada] = useState(false);

  const limpiarSesion = useCallback(async () => {
    configurarApi({ token: null });
    setUsuario(null);
    setBloqueada(false);
    await Promise.all([borrar(K.token), borrar(K.bloqueo), borrarJson(USUARIO)]);
  }, []);

  // Al abrir la app: servidor, caja y sesión guardados (los permisos se recargan del servidor)
  useEffect(() => {
    configurarApi({ alSesionVencida: () => { limpiarSesion(); } });
    (async () => {
      const [guardado, t, c, b] = await Promise.all([leer(K.servidor), leer(K.token), leer(K.caja), leer(K.bloqueo)]);
      const s = SERVIDOR_FIJO || guardado;
      if (s) {
        setServidor(s);
        configurarApi({ servidor: s });
      }
      if (c) setCajaId(Number(c));
      if (s && t) {
        configurarApi({ token: t });
        try {
          const yo = await getMe();
          setUsuario(yo);
          recordarUsuario(yo);
          // Cerrar y abrir la app no quita el bloqueo
          if (b && Number(b) === yo.id) setBloqueada(true);
        } catch (err) {
          // Sin conexión: se sigue con la sesión guardada para poder vender sin servidor.
          // Token vencido u otro error: se vuelve a pedir el inicio de sesión
          const guardado = err instanceof ApiError && err.sinConexion ? await leerJson<Usuario>(USUARIO) : null;
          if (guardado) {
            setUsuario(guardado);
            if (b && Number(b) === guardado.id) setBloqueada(true);
          } else {
            configurarApi({ token: null });
          }
        }
      }
      setListo(true);
    })();
  }, [limpiarSesion]);

  const fijarServidor = useCallback(async (valor: string) => {
    const url = SERVIDOR_FIJO || normalizarServidor(valor);
    setServidor(url);
    configurarApi({ servidor: url });
    await guardar(K.servidor, url);
  }, []);

  const entrar = useCallback(async (email: string, password: string) => {
    const res = await iniciarSesion(email.trim(), password);
    configurarApi({ token: res.token });
    await guardar(K.token, res.token);
    const yo = await getMe();
    setUsuario(yo);
    recordarUsuario(yo);
  }, []);

  const salir = useCallback(async () => {
    try {
      await cerrarSesion();
    } catch {
      // Si no hay conexión igual se olvida la sesión en la tablet
    }
    await limpiarSesion();
  }, [limpiarSesion]);

  const fijarCaja = useCallback(async (id: number | null) => {
    setCajaId(id);
    if (id) await guardar(K.caja, String(id));
    else await borrar(K.caja);
  }, []);

  const refrescarUsuario = useCallback(async () => {
    try {
      const yo = await getMe();
      setUsuario(yo);
      recordarUsuario(yo);
    } catch {
      // Sin conexión se conservan los permisos que ya tenía; si la sesión venció, la API avisa
    }
  }, []);

  const bloquear = useCallback(async () => {
    if (!usuario) return;
    setBloqueada(true);
    await guardar(K.bloqueo, String(usuario.id));
  }, [usuario]);

  // El servidor revisa el PIN (o la contraseña); si falla, lanza el error con el mensaje.
  // Un PIN de otra persona cierra la sesión anterior y abre la suya (una tablet, varios meseros)
  const desbloquear = useCallback(async (codigo: string, conContrasena: boolean) => {
    let cambio = false;
    if (conContrasena) {
      await desbloquearPantalla(codigo);
    } else {
      const r = await cambiarUsuarioConPin(codigo);
      if (r.token) {
        configurarApi({ token: r.token });
        await guardar(K.token, r.token);
      }
      // También si el cambio se hizo pero no se alcanzó a leer el usuario (reintento con el mismo PIN)
      if (r.usuario_id !== usuario?.id) {
        const yo = await getMe();
        setUsuario(yo);
        recordarUsuario(yo);
        cambio = true;
      }
    }
    setBloqueada(false);
    await borrar(K.bloqueo);
    return cambio;
  }, [usuario?.id]);

  // El rol admin tiene acceso total
  const puede = useCallback(
    (permiso: string) => !!usuario && (usuario.roles.includes('admin') || usuario.permissions.includes(permiso)),
    [usuario],
  );

  const valor = useMemo(
    () => ({ listo, servidor, usuario, cajaId, fijarServidor, entrar, salir, fijarCaja, puede, refrescarUsuario, bloqueada, bloquear, desbloquear }),
    [listo, servidor, usuario, cajaId, fijarServidor, entrar, salir, fijarCaja, puede, refrescarUsuario, bloqueada, bloquear, desbloquear],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useSesion = (): Sesion => {
  const s = useContext(Contexto);
  if (!s) throw new Error('useSesion fuera de SesionProvider');
  return s;
};
