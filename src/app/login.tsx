import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Boton, Campo, Teclado } from '@/components/ui';
import { C } from '@/constants/colores';
import { ApiError, mensajeError } from '@/lib/api';
import { SERVIDOR_FIJO, useSesion } from '@/lib/sesion';

export default function Login() {
  const { entrar, entrarConPin, tabletRegistrada, servidor } = useSesion();
  // En una tablet ya registrada se entra con PIN; la primera vez, con correo y contraseña
  const [pinElegido, setConPin] = useState(tabletRegistrada);
  // Si el servidor rechaza la tablet (dejó de estar registrada), se vuelve al correo
  const conPin = pinElegido && tabletRegistrada;
  const [pin, setPin] = useState('');
  const [espera, setEspera] = useState(0); // segundos que faltan tras muchos PIN incorrectos
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const enviar = async () => {
    if (!email.trim() || !password) return setError('Escribe tu correo y contraseña');
    setCargando(true);
    setError('');
    try {
      await entrar(email, password);
      router.replace('/');
    } catch (e) {
      setError(mensajeError(e, 'No se pudo iniciar sesión'));
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  const enviarPin = async () => {
    if (!pin || cargando || espera > 0) return;
    setCargando(true);
    setError('');
    try {
      await entrarConPin(pin);
      router.replace('/');
    } catch (err) {
      const segundos = err instanceof ApiError ? Number(err.datos?.segundos ?? 0) : 0;
      if (segundos) setEspera(segundos);
      else setError(mensajeError(err, 'No se pudo iniciar sesión'));
      setPin('');
    } finally {
      setCargando(false);
    }
  };

  const tecla = (t: string) => {
    if (espera > 0) return;
    setPin((c) => (t === '⌫' ? c.slice(0, -1) : t && c.length < 6 ? c + t : c));
  };

  const cambiarModo = () => {
    setConPin((v) => !v);
    setPin('');
    setError('');
  };

  return (
    <SafeAreaView style={e.pantalla}>
      <View style={e.tarjeta}>
        <Text style={e.marca}>Panadería Eduardo</Text>
        <Text style={e.titulo}>Iniciar sesión</Text>
        {conPin ? (
          <>
            <Text style={e.sub}>Escribe tu PIN</Text>
            <View style={e.puntos}>
              {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                <View key={i} style={[e.punto, i < pin.length && e.puntoLleno]} />
              ))}
            </View>
            <Teclado onTecla={tecla} />
            {espera > 0
              ? <Text style={e.error}>Demasiados intentos. Espera {espera} {espera === 1 ? 'segundo' : 'segundos'}.</Text>
              : error ? <Text style={e.error}>{error}</Text> : null}
            <Boton titulo={espera > 0 ? `Espera ${espera} s` : 'Entrar'} onPress={enviarPin} cargando={cargando}
              deshabilitado={!pin || espera > 0} />
            <Pressable onPress={cambiarModo} hitSlop={8}>
              <Text style={e.enlace}>Entrar con correo y contraseña</Text>
            </Pressable>
          </>
        ) : (
        <>
        <Campo etiqueta="Correo" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false}
          keyboardType="email-address" textContentType="username" />
        <Campo etiqueta="Contraseña" value={password} onChangeText={setPassword} secureTextEntry
          textContentType="password" onSubmitEditing={enviar} />
        {error ? <Text style={e.error}>{error}</Text> : null}
        <Boton titulo="Entrar" onPress={enviar} cargando={cargando} />
        {tabletRegistrada ? (
          <Pressable onPress={cambiarModo} hitSlop={8}>
            <Text style={e.enlace}>Entrar con PIN</Text>
          </Pressable>
        ) : (
          <Text style={e.nota}>Después de entrar aquí la primera vez, en esta tablet se podrá entrar con PIN.</Text>
        )}
        </>
        )}
        {/* Con servidor fijo de la compilación no se ofrece cambiarlo */}
        {SERVIDOR_FIJO ? null : (
          <Pressable onPress={() => router.push('/servidor')} hitSlop={8}>
            <Text style={e.enlace}>Servidor: {servidor.replace(/^https?:\/\//, '').replace(/\/api$/, '')} · cambiar</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  pantalla: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: C.marca },
  tarjeta: { width: '100%', maxWidth: 420, backgroundColor: '#fff', borderRadius: 20, padding: 24, gap: 14 },
  marca: { fontSize: 15, fontWeight: '700', color: C.marca, textAlign: 'center' },
  titulo: { fontSize: 24, fontWeight: '700', color: C.texto, textAlign: 'center' },
  error: { color: C.peligro, fontSize: 14, textAlign: 'center' },
  enlace: { color: C.primario, fontSize: 13, textAlign: 'center' },
  sub: { fontSize: 15, color: C.suave, textAlign: 'center' },
  nota: { fontSize: 12, color: C.suave, textAlign: 'center' },
  puntos: { flexDirection: 'row', justifyContent: 'center', gap: 14, paddingVertical: 4 },
  punto: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: C.borde },
  puntoLleno: { backgroundColor: C.texto, borderColor: C.texto },
});
