// Ventana para anular algo con motivo (compras, gastos, producción, mermas, pagos, abonos)
import { useState } from 'react';
import { Text } from 'react-native';

import { Boton, Campo, Ventana } from '@/components/ui';
import { C } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar } from '@/lib/aviso';

type Props = {
  titulo: string; subtitulo?: string; aviso?: string; textoBoton?: string; ejemplo?: string;
  onCerrar: () => void; onConfirmar: (motivo: string) => Promise<{ message: string }>; onListo: () => void;
};

/** Se monta solo cuando se va a usar: así empieza siempre vacía. */
export function VentanaMotivo({ visible, ...props }: Props & { visible: boolean }) {
  return visible ? <Contenido {...props} /> : null;
}

function Contenido({ titulo, subtitulo, aviso, textoBoton = 'Anular', ejemplo = 'Se registró por error...', onCerrar, onConfirmar, onListo }: Props) {
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const confirmar = async () => {
    setOcupado(true);
    try {
      const r = await onConfirmar(motivo.trim());
      avisar(r.message);
      onListo();
    } catch (err) {
      avisar('No se pudo completar', mensajeError(err));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Ventana visible titulo={titulo} subtitulo={subtitulo} onCerrar={onCerrar} ancho={480}
      pie={<Boton estilo={{ flex: 1 }} titulo={textoBoton} variante="peligro" cargando={ocupado} deshabilitado={motivo.trim().length < 3} onPress={confirmar} />}>
      {aviso ? <Text style={{ fontSize: 14, color: C.suave }}>{aviso}</Text> : null}
      <Campo etiqueta="Motivo" value={motivo} onChangeText={setMotivo} placeholder={ejemplo} maxLength={300} autoFocus />
    </Ventana>
  );
}
