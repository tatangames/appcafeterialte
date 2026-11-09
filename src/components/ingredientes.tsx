// "Solo 1 huevo", "sin queso", "extra frijol": mismo precio, cocina lo ve y el inventario baja solo lo que salió
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Boton, Ventana } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { cantidad as numero } from '@/lib/formato';
import { AjusteNuevo, AjusteReceta, IngredienteReceta } from '@/lib/tipos';

type Props = {
  titulo: string; receta: IngredienteReceta[]; actuales: AjusteReceta[]; guardando: boolean;
  onCerrar: () => void; onGuardar: (ajustes: AjusteNuevo[]) => void;
};

// En unidades se sube de 1 en 1 (huevos); en gramos o mililitros, de media porción
const pasoDe = (i: IngredienteReceta) => (!i.unidad || i.unidad === 'u' ? (Number.isInteger(i.base) ? 1 : i.base) : i.base / 2);
const conUnidad = (v: number, i: IngredienteReceta) => `${numero(v)}${i.unidad && i.unidad !== 'u' ? ` ${i.unidad}` : ''}`;

export function IngredientesModal({ visible, ...props }: Props & { visible: boolean }) {
  return visible ? <Contenido {...props} /> : null;
}

function Contenido({ titulo, receta, actuales, guardando, onCerrar, onGuardar }: Props) {
  const [valores, setValores] = useState<Record<number, number>>(() =>
    Object.fromEntries(receta.map((i) => [i.producto_id, actuales.find((a) => a.producto_id === i.producto_id)?.cantidad ?? i.base])));

  const cambiados = receta.filter((i) => Math.abs((valores[i.producto_id] ?? i.base) - i.base) > 0.0001);
  const poner = (i: IngredienteReceta, v: number) => setValores((s) => ({ ...s, [i.producto_id]: Math.max(0, Math.round(v * 10000) / 10000) }));

  return (
    <Ventana visible titulo={`Ingredientes de ${titulo}`} subtitulo="Lo que pide distinto el cliente. El precio no cambia." onCerrar={onCerrar} ancho={560}
      pie={
        <Boton estilo={{ flex: 1 }} cargando={guardando} titulo={cambiados.length ? `Guardar ${cambiados.length} cambio(s)` : 'Dejar normal'}
          onPress={() => onGuardar(cambiados.map((i) => ({ producto_id: i.producto_id, cantidad: valores[i.producto_id] })))} />
      }>
      {receta.map((i) => {
        const valor = valores[i.producto_id] ?? i.base;
        const paso = pasoDe(i);
        const etiqueta = valor === 0 ? 'Sin' : valor < i.base ? 'Menos' : valor > i.base ? 'Extra' : null;
        return (
          <View key={i.producto_id} style={e.fila}>
            <View style={{ flex: 1 }}>
              <Text style={e.nombre}>{i.nombre}</Text>
              <Text style={e.suave}>
                Lleva {conUnidad(i.base, i)}{etiqueta ? '  ' : ''}
                {etiqueta && <Text style={[e.marca, valor === 0 && { color: C.peligro }]}>{etiqueta}</Text>}
              </Text>
            </View>
            <Pressable onPress={() => poner(i, 0)} style={[e.sin, valor === 0 && { opacity: 0.4 }]} disabled={valor === 0}>
              <Text style={e.sinTexto}>Sin</Text>
            </Pressable>
            <Pressable onPress={() => poner(i, valor - paso)} style={e.paso} disabled={valor <= 0}><Text style={e.pasoTexto}>−</Text></Pressable>
            <Text style={e.valor}>{conUnidad(valor, i)}</Text>
            <Pressable onPress={() => poner(i, valor + paso)} style={e.paso} disabled={valor >= i.base * 5}><Text style={e.pasoTexto}>+</Text></Pressable>
          </View>
        );
      })}
    </Ventana>
  );
}

const e = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderColor: C.borde },
  nombre: { fontSize: 16, fontWeight: '700', color: C.texto },
  suave: { fontSize: 13, color: C.suave },
  marca: { fontWeight: '800', color: C.aviso },
  sin: { height: 44, paddingHorizontal: 12, borderRadius: radio, backgroundColor: '#FEE2E2', justifyContent: 'center' },
  sinTexto: { fontWeight: '700', color: C.peligro },
  paso: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  pasoTexto: { fontSize: 22, fontWeight: '700', color: C.texto },
  valor: { minWidth: 64, textAlign: 'center', fontSize: 16, fontWeight: '700', color: C.texto },
});
