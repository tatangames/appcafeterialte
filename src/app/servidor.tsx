import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Boton, Campo } from '@/components/ui';
import { C } from '@/constants/colores';
import { normalizarServidor } from '@/lib/api';
import { useSesion } from '@/lib/sesion';

// Dirección del servidor del POS en la red del local (la misma que usa la web)
export default function Servidor() {
  const { servidor, fijarServidor } = useSesion();
  const [valor, setValor] = useState(servidor.replace(/\/api$/, ''));
  const [probando, setProbando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async () => {
    const url = normalizarServidor(valor);
    if (!url) return setError('Escribe la dirección del servidor');
    setProbando(true);
    setError('');
    try {
      // Cualquier respuesta (aunque sea 405) prueba que el servidor está ahí
      await fetch(`${url}/login`, { method: 'GET', headers: { Accept: 'application/json' } });
      await fijarServidor(url);
      router.replace('/');
    } catch {
      setError('No se pudo conectar. Revisa que la tablet esté en el Wi-Fi del local y la dirección.');
    } finally {
      setProbando(false);
    }
  };

  return (
    <SafeAreaView style={e.pantalla}>
      <View style={e.tarjeta}>
        <Text style={e.titulo}>Servidor del punto de venta</Text>
        <Text style={e.texto}>La dirección de la computadora donde corre el sistema, por ejemplo 192.168.1.4:8080</Text>
        <Campo etiqueta="Dirección" value={valor} onChangeText={setValor} autoCapitalize="none" autoCorrect={false}
          keyboardType="url" placeholder="192.168.1.4:8080" onSubmitEditing={guardar} />
        {error ? <Text style={e.error}>{error}</Text> : null}
        <Boton titulo="Guardar y conectar" onPress={guardar} cargando={probando} />
      </View>
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  pantalla: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: C.marca },
  tarjeta: { width: '100%', maxWidth: 460, backgroundColor: '#fff', borderRadius: 20, padding: 24, gap: 14 },
  titulo: { fontSize: 22, fontWeight: '700', color: C.texto },
  texto: { fontSize: 15, color: C.suave },
  error: { color: C.peligro, fontSize: 14 },
});
