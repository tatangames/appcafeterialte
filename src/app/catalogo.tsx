import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoriasUnidades } from '@/components/catalogo/categorias';
import { ProductosCatalogo } from '@/components/catalogo/productos';
import { RecetasCatalogo } from '@/components/catalogo/recetas';
import { Encabezado } from '@/components/encabezado';
import { C } from '@/constants/colores';
import { useSesion } from '@/lib/sesion';

type Pestana = 'productos' | 'recetas' | 'categorias';

// Lo que se vende y cómo se arma: productos (con sus extras), recetas, categorías y unidades.
// Cada pestaña aparece solo con su permiso
const PESTANAS: { id: Pestana; texto: string; permisos: string[] }[] = [
  { id: 'productos', texto: 'Productos', permisos: ['productos.gestionar', 'productos.ver'] },
  { id: 'recetas', texto: 'Recetas', permisos: ['recetas.gestionar'] },
  { id: 'categorias', texto: 'Categorías y unidades', permisos: ['catalogos.gestionar'] },
];

export default function Catalogo() {
  const { puede } = useSesion();
  const visibles = PESTANAS.filter((p) => p.permisos.some(puede));
  const [pestana, setPestana] = useState<Pestana>(visibles[0]?.id ?? 'productos');

  return (
    <SafeAreaView style={e.pantalla} edges={['top', 'left', 'right', 'bottom']}>
      <Encabezado titulo="Catálogo" subtitulo="Productos, recetas y categorías" />
      <View style={e.pestanas}>
        {visibles.map((p) => (
          <Pressable key={p.id} onPress={() => setPestana(p.id)} style={[e.pestana, pestana === p.id && e.pestanaActiva]}>
            <Text style={[e.pestanaTexto, pestana === p.id && { color: C.primario }]}>{p.texto}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flex: 1 }}>
        {pestana === 'productos' && <ProductosCatalogo />}
        {pestana === 'recetas' && <RecetasCatalogo />}
        {pestana === 'categorias' && <CategoriasUnidades />}
      </View>
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo },
  pestanas: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderColor: C.borde },
  pestana: { flex: 1, height: 50, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderColor: 'transparent' },
  pestanaActiva: { borderColor: C.primario },
  pestanaTexto: { fontSize: 15, fontWeight: '700', color: C.suave },
});
