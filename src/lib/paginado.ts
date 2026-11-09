// Lista paginada del servidor: carga la primera página y «Ver más» agrega las siguientes.
// Una respuesta vieja (se cambió el filtro mientras cargaba) se descarta.
import { useCallback, useRef, useState } from 'react';

import { mensajeError } from '@/lib/api';

type ConPaginas = { pagina?: number; total_paginas?: number };

export function useListaPaginada<R extends ConPaginas, T>(pedir: (pagina: number) => Promise<R>, lista: (r: R) => T[]) {
  const [respuesta, setRespuesta] = useState<R | null>(null);
  const [items, setItems] = useState<T[]>([]);
  const [error, setError] = useState('');
  const [cargandoMas, setCargandoMas] = useState(false);
  const turno = useRef(0);

  const cargar = useCallback(async () => {
    const yo = ++turno.current;
    try {
      const r = await pedir(1);
      if (yo !== turno.current) return;
      setRespuesta(r);
      setItems(lista(r));
      setError('');
    } catch (err) {
      if (yo === turno.current) setError(mensajeError(err));
    }
    // `lista` solo extrae el arreglo: no cambia entre renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedir]);

  const pagina = respuesta?.pagina ?? 1;
  const hayMas = pagina < (respuesta?.total_paginas ?? 1);

  const verMas = async () => {
    if (!hayMas || cargandoMas) return;
    const yo = turno.current;
    setCargandoMas(true);
    try {
      const r = await pedir(pagina + 1);
      if (yo !== turno.current) return;
      setRespuesta(r);
      setItems((actuales) => [...actuales, ...lista(r)]);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargandoMas(false);
    }
  };

  return { respuesta, items, error, cargar, verMas, hayMas, cargandoMas };
}
