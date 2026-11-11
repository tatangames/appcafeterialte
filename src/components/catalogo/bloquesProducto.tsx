// Los extras propios de un producto, en bloques (Tipo de leche, Azúcar, Extras): agregar, editar y
// quitar. En un producto ya guardado se guardan al momento; en uno nuevo, junto con el producto.
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DatosExtras, FormConjunto, VistaTarjeta } from '@/components/catalogo/extras';
import { Boton } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar, confirmar } from '@/lib/aviso';
import * as op from '@/lib/operaciones';

/** Los bloques aún sin guardar (producto nuevo) con la forma de la vista. */
const aVista = (bloques: op.BloqueGuardar[], datos: DatosExtras): op.ConjuntoExtra => ({
  id: 0, producto_id: 0, producto: '',
  bloques: bloques.map((b, n) => ({
    id: -(n + 1), nombre: b.nombre, minimo: b.minimo, maximo: b.maximo, obligatorio: b.minimo > 0, multiple: true, activo: true,
    productos: [],
    opciones: b.opciones.map((o, k) => ({
      id: -(n * 100 + k + 1), nombre: o.nombre, precio: o.precio, activo: o.activo, maximo: o.maximo,
      obligatorio: o.obligatorio, exclusiva: o.exclusiva, producto_id: o.producto_id,
      insumo: datos.insumos.find((i) => i.id === o.producto_id)?.nombre ?? null, cantidad: o.cantidad, unidad_medida_id: o.unidad_medida_id,
      unidad: datos.unidades.find((u) => u.id === o.unidad_medida_id)?.abreviatura ?? null,
    })),
  })),
});

export function BloquesProducto({ productoId, nombre, pendientes = null, onPendientes }: {
  productoId: number | null; nombre: string;
  // Producto nuevo: los bloques que se guardarán junto con él
  pendientes?: op.BloqueGuardar[] | null; onPendientes?: (bloques: op.BloqueGuardar[] | null) => void;
}) {
  const [datos, setDatos] = useState<DatosExtras | null>(null);
  const [editando, setEditando] = useState(false);
  const [quitando, setQuitando] = useState(false);

  const cargar = useCallback(() => {
    op.getGruposExtras().then(setDatos).catch((err) => avisar('No se pudieron cargar los extras', mensajeError(err)));
  }, []);
  useEffect(cargar, [cargar]);

  if (!datos) return <Text style={e.suave}>Cargando extras...</Text>;
  const nuevo = productoId === null;
  const suyos = nuevo ? (pendientes?.length ? aVista(pendientes, datos) : null)
    : datos.conjuntos.find((c) => c.producto_id === productoId) ?? null;

  const quitar = async () => {
    if (nuevo) return onPendientes?.(null);
    if (!(await confirmar(`¿Quitar los extras de «${nombre}»?`, 'Se venderá sin elegir nada.', 'Quitar'))) return;
    setQuitando(true);
    try {
      avisar((await op.quitarExtrasProducto(productoId)).message);
      cargar();
    } catch (err) {
      avisar('No se pudo quitar', mensajeError(err));
    } finally {
      setQuitando(false);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <Text style={e.suave}>Lo que se elige al venderlo (tipo de leche, azúcar, extras). Son solo de este producto{nuevo ? '; se guardan junto con él.' : '; se guardan al momento.'}</Text>
      {suyos ? <View style={e.tarjeta}><VistaTarjeta conjunto={suyos} /></View>
        : <Text style={e.vacio}>No lleva extras. Agrégale bloques si al venderlo hay que elegir algo.</Text>}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Boton titulo={suyos ? 'Editar extras' : '+ Agregar extras'} variante="contorno" chico onPress={() => setEditando(true)} />
        {suyos && <Boton titulo="Quitar extras" variante="contorno" chico deshabilitado={quitando} onPress={quitar} />}
      </View>
      {editando && (
        <FormConjunto producto={{ id: productoId, nombre }} conjunto={suyos} datos={datos}
          onCerrar={() => setEditando(false)}
          onListo={(bloques) => { setEditando(false); if (nuevo) onPendientes?.(bloques); else cargar(); }} />
      )}
    </View>
  );
}

const e = StyleSheet.create({
  suave: { fontSize: 13, color: C.suave },
  vacio: { fontSize: 14, color: C.suave, padding: 14, textAlign: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: '#D1D5DB', borderRadius: radio },
  tarjeta: { borderWidth: 1, borderColor: C.borde, borderRadius: radio, padding: 12, backgroundColor: '#fff' },
});
