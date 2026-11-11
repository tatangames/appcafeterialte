// Los extras propios de un producto, en bloques (Tipo de leche, Azúcar, Extras): agregar, editar
// (o copiar de otro producto) y quitar. Se guarda al momento, aparte del botón «Guardar producto».
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DatosExtras, FormConjunto, VistaTarjeta } from '@/components/catalogo/extras';
import { Boton } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar, confirmar } from '@/lib/aviso';
import * as op from '@/lib/operaciones';

export function BloquesProducto({ productoId, nombre }: { productoId: number; nombre: string }) {
  const [datos, setDatos] = useState<DatosExtras | null>(null);
  const [editando, setEditando] = useState(false);
  const [quitando, setQuitando] = useState(false);

  const cargar = useCallback(() => {
    op.getGruposExtras().then(setDatos).catch((err) => avisar('No se pudieron cargar los extras', mensajeError(err)));
  }, []);
  useEffect(cargar, [cargar]);

  if (!datos) return <Text style={e.suave}>Cargando extras...</Text>;
  const suyos = datos.conjuntos.find((c) => c.producto_id === productoId) ?? null;

  const quitar = async () => {
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
      <Text style={e.suave}>Lo que se elige al vender este producto. Son solo suyos; se guardan al momento.</Text>
      {suyos ? <View style={e.tarjeta}><VistaTarjeta conjunto={suyos} /></View>
        : <Text style={e.vacio}>No lleva extras. Agrégale bloques o cópialos de otro producto.</Text>}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Boton titulo={suyos ? 'Editar extras' : '+ Agregar extras'} variante="contorno" chico onPress={() => setEditando(true)} />
        {suyos && <Boton titulo="Quitar extras" variante="contorno" chico deshabilitado={quitando} onPress={quitar} />}
      </View>
      {editando && (
        <FormConjunto producto={{ id: productoId, nombre }} conjunto={suyos} datos={datos}
          onCerrar={() => setEditando(false)} onListo={() => { setEditando(false); cargar(); }} />
      )}
    </View>
  );
}

const e = StyleSheet.create({
  suave: { fontSize: 13, color: C.suave },
  vacio: { fontSize: 14, color: C.suave, padding: 14, textAlign: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: '#D1D5DB', borderRadius: radio },
  tarjeta: { borderWidth: 1, borderColor: C.borde, borderRadius: radio, padding: 12, backgroundColor: '#fff' },
});
