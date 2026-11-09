import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Impresoras } from '@/components/ajustes/impresoras';
import { MesasCocina } from '@/components/ajustes/mesas';
import { NegocioCajas } from '@/components/ajustes/negocio';
import { ManualesPorRol, RolesPermisos, Usuarios } from '@/components/ajustes/usuarios';
import { Encabezado } from '@/components/encabezado';
import { C } from '@/constants/colores';
import { useSesion } from '@/lib/sesion';

type Seccion = 'mesas' | 'negocio' | 'impresoras' | 'usuarios' | 'roles' | 'manuales';

// Configuración del sistema desde la tablet. Cada sección aparece solo con su permiso
const SECCIONES: { id: Seccion; texto: string; permiso: string }[] = [
  { id: 'mesas', texto: 'Mesas y cocina', permiso: 'mesas.configurar' },
  { id: 'negocio', texto: 'Negocio, cajas y pagos', permiso: 'configuracion.gestionar' },
  { id: 'impresoras', texto: 'Impresoras', permiso: 'impresoras.gestionar' },
  { id: 'usuarios', texto: 'Usuarios', permiso: 'usuarios.gestionar' },
  { id: 'roles', texto: 'Roles y permisos', permiso: 'roles.gestionar' },
  { id: 'manuales', texto: 'Manuales por rol', permiso: 'roles.gestionar' },
];

export default function Ajustes() {
  const { puede } = useSesion();
  const visibles = SECCIONES.filter((s) => puede(s.permiso));
  const [seccion, setSeccion] = useState<Seccion>(visibles[0]?.id ?? 'mesas');

  return (
    <SafeAreaView style={e.pantalla} edges={['top', 'left', 'right']}>
      <Encabezado titulo="Ajustes" subtitulo="Configuración del sistema" />
      <View style={e.barra}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={e.pestanas}>
          {visibles.map((s) => (
            <Pressable key={s.id} onPress={() => setSeccion(s.id)} style={[e.pestana, seccion === s.id && e.pestanaActiva]}>
              <Text style={[e.pestanaTexto, seccion === s.id && { color: C.primario }]}>{s.texto}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <View style={{ flex: 1 }}>
        {visibles.length === 0 && <Text style={e.vacio}>Tu rol no tiene permisos de configuración.</Text>}
        {seccion === 'mesas' && puede('mesas.configurar') && <MesasCocina />}
        {seccion === 'negocio' && puede('configuracion.gestionar') && <NegocioCajas />}
        {seccion === 'impresoras' && puede('impresoras.gestionar') && <Impresoras />}
        {seccion === 'usuarios' && puede('usuarios.gestionar') && <Usuarios />}
        {seccion === 'roles' && puede('roles.gestionar') && <RolesPermisos />}
        {seccion === 'manuales' && puede('roles.gestionar') && <ManualesPorRol />}
      </View>
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo },
  barra: { backgroundColor: '#fff', borderBottomWidth: 1, borderColor: C.borde },
  pestanas: { paddingHorizontal: 8 },
  pestana: { height: 50, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderColor: 'transparent' },
  pestanaActiva: { borderColor: C.primario },
  pestanaTexto: { fontSize: 15, fontWeight: '700', color: C.suave },
  vacio: { textAlign: 'center', color: C.suave, padding: 24 },
});
