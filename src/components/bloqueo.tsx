// Bloqueo de pantalla de la tablet y el PIN propio de cada usuario
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Boton, Campo, Teclado, Ventana } from '@/components/ui';
import { C } from '@/constants/colores';
import { ApiError } from '@/lib/api';
import { avisar } from '@/lib/aviso';
import { useConexion } from '@/lib/conexion';
import { useSesion } from '@/lib/sesion';
import { cambiarMiPin } from '@/lib/servicios';

const mensaje = (e: unknown, porDefecto: string) => (e instanceof Error && e.message ? e.message : porDefecto);

/** Botón "Bloquear": dejas la tablet y el siguiente mesero entra con su PIN (o tú vuelves con el tuyo). */
export function BotonBloquear() {
  const { usuario, bloquear } = useSesion();
  if (!usuario) return null;
  return <Boton titulo="Bloquear" variante="contorno" chico onPress={() => { bloquear(); }} />;
}

/**
 * Tapa toda la app hasta que alguien escriba su PIN: si es de otra persona, entra con su
 * propia sesión (una sola tablet para varios meseros). Quien tenía la sesión también puede
 * usar su contraseña. Si cierran y abren la app, sigue bloqueada. El botón atrás no la quita.
 */
export function PantallaBloqueo() {
  const { usuario, bloqueada } = useSesion();
  if (!usuario) return null;
  return (
    <Modal visible={bloqueada} animationType="fade" onRequestClose={() => {}} supportedOrientations={['portrait', 'landscape']}>
      {/* Se monta de cero en cada bloqueo: empieza sin nada escrito */}
      {bloqueada && <Contenido />}
    </Modal>
  );
}

function Contenido() {
  const { usuario, desbloquear, salir } = useSesion();
  const { cola, sincronizar } = useConexion();
  // Siempre empieza en PIN: aunque quien estaba no tenga, el siguiente mesero entra con el suyo
  const [conContrasena, setConContrasena] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [espera, setEspera] = useState(0); // segundos que faltan tras muchos intentos fallidos

  // Cuenta regresiva visible; al llegar a 0 se puede volver a intentar
  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  if (!usuario) return null;

  const enviar = async (valor = codigo) => {
    if (!valor.trim() || enviando || espera > 0) return;
    setEnviando(true);
    setError('');
    try {
      // Las ventas sin conexión se envían con la sesión de quien está: primero se mandan,
      // para que no queden a nombre del siguiente mesero
      if (!conContrasena && cola.some((v) => v.estado === 'pendiente') && (await sincronizar()) > 0) {
        setError(`Hay ventas de ${usuario?.nombre} sin enviar (sin conexión). Cuando vuelva la conexión se envían y se puede cambiar de usuario.`);
        setCodigo('');
        return;
      }
      if (await desbloquear(valor.trim(), conContrasena)) router.replace('/inicio');
    } catch (e) {
      const segundos = e instanceof ApiError ? Number(e.datos?.segundos ?? 0) : 0;
      if (segundos) {
        setEspera(segundos);
        setError('');
      } else {
        setError(mensaje(e, 'No se pudo verificar'));
      }
      setCodigo('');
    } finally {
      setEnviando(false);
    }
  };

  const tecla = (t: string) => {
    if (espera > 0) return;
    setCodigo((c) => (t === '⌫' ? c.slice(0, -1) : t && c.length < 6 ? c + t : c));
  };

  return (
      <View style={e.fondo}>
        <View style={e.tarjeta}>
          <Image source={require('../../assets/images/logo-negocio.png')} style={e.logo} resizeMode="contain" accessibilityLabel="Panadería Eduardo" />
          <Text style={e.titulo}>🔒 Tablet bloqueada</Text>
          <Text style={e.sub}>{conContrasena ? `${usuario.nombre}: escribe tu contraseña` : 'Escribe tu PIN para entrar'}</Text>
          {!conContrasena && <Text style={e.nota}>Última sesión: {usuario.nombre}</Text>}

          {conContrasena ? (
            <Campo value={codigo} onChangeText={setCodigo} secureTextEntry autoFocus autoCapitalize="none"
              placeholder="Contraseña" onSubmitEditing={() => enviar()} />
          ) : (
            <>
              <View style={e.puntos}>
                {Array.from({ length: Math.max(4, codigo.length) }).map((_, i) => (
                  <View key={i} style={[e.punto, i < codigo.length && e.puntoLleno]} />
                ))}
              </View>
              <Teclado onTecla={tecla} />
            </>
          )}

          {espera > 0
            ? <Text style={e.error}>Demasiados intentos. Espera {espera} {espera === 1 ? 'segundo' : 'segundos'}.</Text>
            : error ? <Text style={e.error}>{error}</Text> : null}
          <Boton titulo={enviando ? 'Verificando...' : espera > 0 ? `Espera ${espera} s` : 'Desbloquear'} onPress={() => enviar()}
            deshabilitado={!codigo.trim() || espera > 0} cargando={enviando} />

          <Pressable onPress={() => { setConContrasena((v) => !v); setCodigo(''); setError(''); }} hitSlop={8}>
            <Text style={e.enlace}>{conContrasena ? 'Usar PIN' : `Soy ${usuario.nombre}: usar mi contraseña`}</Text>
          </Pressable>
          <Text style={e.nota}>¿Sin PIN o lo olvidaste? Entra con tu correo y contraseña y créalo en «Crear PIN».</Text>
          <Pressable onPress={() => { salir(); }} hitSlop={8}>
            <Text style={e.salir}>Entrar con correo y contraseña</Text>
          </Pressable>
        </View>
      </View>
  );
}

/** Ventana para crear o cambiar el PIN propio (pide la contraseña actual). */
export function VentanaMiPin({ visible, onCerrar }: { visible: boolean; onCerrar: () => void }) {
  const { usuario, refrescarUsuario } = useSesion();
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [repetido, setRepetido] = useState('');
  const [guardando, setGuardando] = useState(false);

  const soloNumeros = (v: string) => v.replace(/\D/g, '').slice(0, 6);
  const listo = !!password && pin.length >= 4 && pin === repetido;

  const cerrar = () => {
    setPassword('');
    setPin('');
    setRepetido('');
    onCerrar();
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await cambiarMiPin({ password_actual: password, pin, pin_confirmation: repetido });
      await refrescarUsuario();
      avisar('Listo', r.message);
      cerrar();
    } catch (e) {
      avisar('No se guardó', mensaje(e, 'No se pudo guardar el PIN'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Ventana visible={visible} onCerrar={cerrar} ancho={440}
      titulo={usuario?.tiene_pin ? 'Cambiar mi PIN' : 'Crear mi PIN'}
      subtitulo="Con él entras a la tablet bloqueada sin correo ni contraseña. Si eres administrador, también para autorizar."
      pie={
        <>
          <Boton estilo={{ flex: 1 }} titulo="Cancelar" variante="contorno" onPress={cerrar} />
          <Boton estilo={{ flex: 1 }} titulo="Guardar PIN" onPress={guardar} deshabilitado={!listo} cargando={guardando} />
        </>
      }>
      <Campo etiqueta="Tu contraseña" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
      <Campo etiqueta="PIN nuevo (4 a 6 números)" value={pin} onChangeText={(v) => setPin(soloNumeros(v))} keyboardType="number-pad" secureTextEntry />
      <Campo etiqueta="Repite el PIN" value={repetido} onChangeText={(v) => setRepetido(soloNumeros(v))} keyboardType="number-pad" secureTextEntry />
      {repetido && pin !== repetido ? <Text style={e.error}>Los PIN no coinciden</Text> : null}
    </Ventana>
  );
}

const e = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center', padding: 20 },
  tarjeta: { width: '100%', maxWidth: 400, backgroundColor: '#fff', borderRadius: 20, padding: 22, gap: 12 },
  logo: { width: 96, height: 96, borderRadius: 48, alignSelf: 'center' },
  titulo: { fontSize: 22, fontWeight: '800', color: C.texto, textAlign: 'center' },
  sub: { fontSize: 15, color: C.suave, textAlign: 'center' },
  puntos: { flexDirection: 'row', justifyContent: 'center', gap: 14, paddingVertical: 8 },
  punto: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: C.borde },
  puntoLleno: { backgroundColor: C.texto, borderColor: C.texto },
  error: { color: C.peligro, fontWeight: '600', textAlign: 'center' },
  enlace: { color: C.primario, fontWeight: '600', textAlign: 'center' },
  nota: { fontSize: 12, color: C.suave, textAlign: 'center' },
  salir: { color: C.suave, fontWeight: '600', textAlign: 'center', paddingTop: 4 },
});
