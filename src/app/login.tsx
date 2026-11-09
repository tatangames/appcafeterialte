import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Boton, Campo } from '@/components/ui';
import { C } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { SERVIDOR_FIJO, useSesion } from '@/lib/sesion';

export default function Login() {
  const { entrar, servidor } = useSesion();
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

  return (
    <SafeAreaView style={e.pantalla}>
      <View style={e.tarjeta}>
        <Text style={e.marca}>Panadería Eduardo</Text>
        <Text style={e.titulo}>Iniciar sesión</Text>
        <Campo etiqueta="Correo" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false}
          keyboardType="email-address" textContentType="username" />
        <Campo etiqueta="Contraseña" value={password} onChangeText={setPassword} secureTextEntry
          textContentType="password" onSubmitEditing={enviar} />
        {error ? <Text style={e.error}>{error}</Text> : null}
        <Boton titulo="Entrar" onPress={enviar} cargando={cargando} />
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
});
