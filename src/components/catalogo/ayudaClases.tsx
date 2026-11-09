// Guía «¿Qué clase elijo?» del formulario de productos (la misma de la web):
// qué es cada clase, ejemplos y qué casillas lleva. «Usar esta» aplica la clase con sus casillas.
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { C } from '@/constants/colores';

export type AjustesClase = { clase: string; se_vende: boolean; controla_stock: boolean; permite_fraccion: boolean };

const TIPOS: { titulo: string; queEs: string; movimiento: string; ejemplos: string; ajustes: AjustesClase }[] = [
  {
    titulo: 'Producto terminado · se hornea y se guarda',
    queEs: 'Lo que el negocio hace por adelantado y se vende por pieza.',
    movimiento: 'Sube al registrar la producción y baja al venderlo.',
    ejemplos: 'Pan francés, concha, pastel tres leches (porción)',
    ajustes: { clase: 'producto_terminado', se_vende: true, controla_stock: true, permite_fraccion: false },
  },
  {
    titulo: 'Producto terminado · se prepara al momento',
    queEs: 'Lo que se prepara cuando el cliente lo pide; no tiene existencia propia.',
    movimiento: 'Al venderlo bajan los ingredientes de su receta de venta.',
    ejemplos: 'Café americano, limonada, desayuno, waffle',
    ajustes: { clase: 'producto_terminado', se_vende: true, controla_stock: false, permite_fraccion: false },
  },
  {
    titulo: 'Reventa',
    queEs: 'Lo que se compra hecho y se vende igual, sin transformarlo.',
    movimiento: 'Sube con la compra y baja al venderlo.',
    ejemplos: 'Coca-Cola lata, agua embotellada, chicles',
    ajustes: { clase: 'reventa', se_vende: true, controla_stock: true, permite_fraccion: false },
  },
  {
    titulo: 'Materia prima',
    queEs: 'Ingredientes para hacer los productos. No se venden solos.',
    movimiento: 'Sube con la compra y baja con las recetas (al producir o al vender un plato).',
    ejemplos: 'Harina (lb), azúcar (g), leche (ml), huevo (u), café molido (g)',
    ajustes: { clase: 'materia_prima', se_vende: false, controla_stock: true, permite_fraccion: true },
  },
  {
    titulo: 'Empaque',
    queEs: 'Lo que acompaña al producto pero no se come.',
    movimiento: 'Sube con la compra y baja con las recetas o con ajustes.',
    ejemplos: 'Vaso desechable, tapa, bolsa, caja para pastel',
    ajustes: { clase: 'empaque', se_vende: false, controla_stock: true, permite_fraccion: false },
  },
];

const PREGUNTAS = [
  '¿Lo hacemos o preparamos nosotros? → Producto terminado (con inventario si se hornea antes; sin inventario si se prepara al momento)',
  '¿Lo compramos y lo vendemos tal cual? → Reventa',
  '¿Es un ingrediente para hacer otra cosa? → Materia prima',
  '¿Es un recipiente o envoltura? → Empaque',
];

const coincide = (a: AjustesClase, f: AjustesClase) =>
  a.clase === f.clase && (a.clase !== 'producto_terminado' || a.controla_stock === f.controla_stock);

function Casilla({ si, texto }: { si: boolean; texto: string }) {
  return <Text style={[e.casilla, si ? e.casillaSi : e.casillaNo]}>{si ? '☑' : '☐'} {texto}</Text>;
}

export function AyudaClases({ actual, onElegir }: { actual: AjustesClase; onElegir: (a: AjustesClase) => void }) {
  return (
    <View style={e.caja}>
      <Text style={[e.texto, { fontWeight: '700' }]}>Para decidir, pregúntate:</Text>
      {PREGUNTAS.map((p, i) => <Text key={p} style={e.texto}>{i + 1}. {p}</Text>)}

      {TIPOS.map((t) => {
        const elegida = coincide(t.ajustes, actual);
        return (
          <View key={t.titulo} style={[e.tarjeta, elegida && e.tarjetaElegida]}>
            <View style={e.cabecera}>
              <Text style={[e.texto, { flex: 1, fontWeight: '700', color: C.texto }]}>{t.titulo}</Text>
              {elegida
                ? <Text style={e.elegida}>Elegida</Text>
                : (
                  <Pressable onPress={() => onElegir(t.ajustes)} hitSlop={8} style={e.usar}>
                    <Text style={e.usarTexto}>Usar esta</Text>
                  </Pressable>
                )}
            </View>
            <Text style={e.texto}>{t.queEs}</Text>
            <Text style={e.texto}>{t.movimiento}</Text>
            <Text style={[e.texto, { color: C.suave }]}>Ej.: {t.ejemplos}</Text>
            <View style={e.casillas}>
              <Casilla si={t.ajustes.se_vende} texto="Se vende" />
              <Casilla si={t.ajustes.controla_stock} texto="Lleva inventario" />
              <Casilla si={t.ajustes.permite_fraccion} texto="Decimales" />
            </View>
          </View>
        );
      })}

      <Text style={e.texto}>
        Consumo interno (cena del personal, cortesías): elige «Producto terminado · se prepara al momento» y enciende también Consumo interno.
      </Text>
      <Text style={e.texto}>
        La clase ordena el inventario y los reportes; lo que el sistema hace con el producto lo deciden los interruptores. «Decimales» va cuando se cuenta por peso o medida (lb, g, ml), no por pieza.
      </Text>
    </View>
  );
}

const e = StyleSheet.create({
  caja: { gap: 8, backgroundColor: '#EFF6FF', borderRadius: 8, padding: 12 },
  texto: { fontSize: 13, lineHeight: 19, color: '#1E3A8A' },
  tarjeta: { gap: 4, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#DBEAFE', padding: 10 },
  tarjetaElegida: { borderColor: C.primario, borderWidth: 2 },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  elegida: { fontSize: 11, fontWeight: '700', color: '#fff', backgroundColor: C.primario, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  usar: { borderWidth: 1, borderColor: '#93C5FD', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  usarTexto: { fontSize: 12, fontWeight: '600', color: '#1D4ED8' },
  casillas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 2 },
  casilla: { fontSize: 12, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  casillaSi: { backgroundColor: '#DCFCE7', color: '#166534' },
  casillaNo: { backgroundColor: '#F3F4F6', color: '#6B7280' },
});
