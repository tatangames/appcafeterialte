// Categorías (agrupan el POS y deciden a qué comanda va cada producto) y unidades de medida con su equivalencia
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Interruptor, Opciones } from '@/components/formulario';
import { Boton, Campo, Etiqueta, Ventana } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar } from '@/lib/aviso';
import * as op from '@/lib/operaciones';

const BASE: Record<string, string> = { unidad: 'unidades', masa: 'g', volumen: 'ml' };
const TIPOS = [{ valor: 'unidad', texto: 'Por unidad (docena, caja)' }, { valor: 'masa', texto: 'Peso (lb, kg, oz)' }, { valor: 'volumen', texto: 'Volumen (l, galón)' }];

export function CategoriasUnidades() {
  const [categorias, setCategorias] = useState<op.Categoria[] | null>(null);
  const [unidades, setUnidades] = useState<op.UnidadMedida[] | null>(null);
  const [categoria, setCategoria] = useState<{ item: op.Categoria | null } | null>(null);
  const [unidad, setUnidad] = useState<{ item: op.UnidadMedida | null } | null>(null);

  const cargar = useCallback(() => {
    op.getCategorias().then(setCategorias).catch((err) => avisar('No se pudo cargar', mensajeError(err)));
    op.getUnidades().then(setUnidades).catch(() => null);
  }, []);
  useEffect(cargar, [cargar]);

  return (
    <ScrollView contentContainerStyle={e.contenido}>
      <View style={e.bloque}>
        <View style={e.cabecera}>
          <View style={{ flex: 1 }}>
            <Text style={e.titulo}>Categorías</Text>
            <Text style={e.suave}>Agrupan los productos en Venta rápida y Mesas. El área de cada categoría (Cocina, Barra) se elige en Ajustes › Mesas y cocina.</Text>
          </View>
          <Boton titulo="+ Categoría" chico onPress={() => setCategoria({ item: null })} />
        </View>
        <View style={e.rejilla}>
          {(categorias ?? []).map((c) => (
            <Pressable key={c.id} onPress={() => setCategoria({ item: c })} style={[e.pastilla, !c.estado && { opacity: 0.5 }]}>
              <Text style={e.nombre}>{c.nombre}</Text>
              <Text style={e.suave}>{c.area?.nombre ? `Comanda: ${c.area.nombre}` : 'Sin comanda (directo)'}{!c.estado ? ' · inactiva' : ''}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={e.bloque}>
        <View style={e.cabecera}>
          <View style={{ flex: 1 }}>
            <Text style={e.titulo}>Unidades de medida</Text>
            <Text style={e.suave}>Cada una dice a cuánto equivale. Así se compra en quintales y el inventario se lleva en libras o gramos.</Text>
          </View>
          <Boton titulo="+ Unidad" chico onPress={() => setUnidad({ item: null })} />
        </View>
        {(unidades ?? []).map((u) => (
          <Pressable key={u.id} onPress={() => setUnidad({ item: u })} style={[e.fila, !u.estado && { opacity: 0.5 }]}>
            <Text style={[e.nombre, { flex: 1 }]}>{u.nombre}{u.abreviatura ? ` (${u.abreviatura})` : ''}</Text>
            <Text style={e.suave}>1 = {Number(u.factor_base)} {BASE[u.tipo] ?? ''}</Text>
            {!u.estado && <Etiqueta texto="Inactiva" fondo="#E5E7EB" color="#374151" />}
          </Pressable>
        ))}
      </View>

      {categoria && <FormCategoria item={categoria.item} onCerrar={() => setCategoria(null)} onListo={() => { setCategoria(null); cargar(); }} />}
      {unidad && <FormUnidad item={unidad.item} onCerrar={() => setUnidad(null)} onListo={() => { setUnidad(null); cargar(); }} />}
    </ScrollView>
  );
}

function FormCategoria({ item, onCerrar, onListo }: { item: op.Categoria | null; onCerrar: () => void; onListo: () => void }) {
  const [nombre, setNombre] = useState(item?.nombre ?? '');
  const [activa, setActiva] = useState(item ? !!item.estado : true);
  const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await op.guardarCategoria({ nombre: nombre.trim(), estado: activa }, item?.id);
      avisar(r.message ?? 'Categoría guardada');
      onListo();
    } catch (err) {
      avisar('No se pudo guardar', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Ventana visible titulo={item ? 'Editar categoría' : 'Nueva categoría'} onCerrar={onCerrar} ancho={460}
      pie={<Boton estilo={{ flex: 1 }} titulo="Guardar" cargando={guardando} deshabilitado={!nombre.trim()} onPress={guardar} />}>
      <Campo etiqueta="Nombre" value={nombre} onChangeText={setNombre} placeholder="Bebidas frías" maxLength={100} autoFocus />
      {item && <Interruptor titulo="Activa" detalle="Si la apagas deja de salir como botón en el POS" valor={activa} onCambiar={setActiva} />}
    </Ventana>
  );
}

function FormUnidad({ item, onCerrar, onListo }: { item: op.UnidadMedida | null; onCerrar: () => void; onListo: () => void }) {
  const [nombre, setNombre] = useState(item?.nombre ?? '');
  const [abreviatura, setAbreviatura] = useState(item?.abreviatura ?? '');
  const [tipo, setTipo] = useState<string>(item?.tipo ?? 'masa');
  const [factor, setFactor] = useState(item ? String(Number(item.factor_base)) : '');
  const [activa, setActiva] = useState(item ? !!item.estado : true);
  const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await op.guardarUnidad({ nombre: nombre.trim(), abreviatura: abreviatura.trim() || null, tipo, factor_base: Number(factor), estado: activa }, item?.id);
      avisar(r.message ?? 'Unidad guardada');
      onListo();
    } catch (err) {
      avisar('No se pudo guardar', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Ventana visible titulo={item ? `Editar ${item.nombre}` : 'Nueva unidad'} onCerrar={onCerrar} ancho={520}
      pie={<Boton estilo={{ flex: 1 }} titulo="Guardar" cargando={guardando} deshabilitado={!nombre.trim() || !(Number(factor) > 0)} onPress={guardar} />}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 2 }}><Campo etiqueta="Nombre" value={nombre} onChangeText={setNombre} placeholder="Arroba" maxLength={100} /></View>
        <View style={{ flex: 1 }}><Campo etiqueta="Abreviatura" value={abreviatura} onChangeText={setAbreviatura} placeholder="@" maxLength={10} /></View>
      </View>
      <Text style={e.nombre}>¿Qué mide?</Text>
      <Opciones opciones={TIPOS} valor={tipo} onCambiar={setTipo} />
      <Campo etiqueta={`¿Cuántos ${BASE[tipo]} tiene 1 ${nombre || 'unidad'}?`} value={factor} keyboardType="decimal-pad"
        onChangeText={(t) => setFactor(t.replace(/[^0-9.]/g, ''))} placeholder={tipo === 'masa' ? '11339.8 (una arroba)' : tipo === 'volumen' ? '3785.41 (un galón)' : '12 (una docena)'} />
      {item && <Text style={e.suave}>Cambiar la equivalencia de una unidad que ya se usa cambia cómo se convierten las compras y recetas que la usan.</Text>}
      {item && <Interruptor titulo="Activa" valor={activa} onCambiar={setActiva} />}
    </Ventana>
  );
}

const e = StyleSheet.create({
  contenido: { padding: 12, gap: 12, maxWidth: 1000, width: '100%', alignSelf: 'center' },
  bloque: { backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 14, gap: 10 },
  cabecera: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  titulo: { fontSize: 18, fontWeight: '800', color: C.texto },
  suave: { fontSize: 13, color: C.suave },
  nombre: { fontSize: 15, fontWeight: '700', color: C.texto },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pastilla: { minWidth: 160, padding: 12, borderRadius: radio, borderWidth: 1, borderColor: C.borde, gap: 2 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderColor: C.borde },
});
