/**
 * Puente entre el cliente HTTP y la ventana de autorización: cuando el servidor
 * responde SIN_PERMISO, se pide el PIN (o la contraseña) de quien autoriza y la
 * misma petición se repite con él. Sin ventana montada, la petición falla normal.
 */
export interface SolicitudAutorizacion {
  mensaje: string;
  invalido: boolean;
}

type Abridor = (solicitud: SolicitudAutorizacion) => Promise<string | null>;

let abridor: Abridor | null = null;

export const registrarVentanaAutorizacion = (fn: Abridor | null) => {
  abridor = fn;
};

export const pedirAutorizacion = (solicitud: SolicitudAutorizacion): Promise<string | null> =>
  abridor ? abridor(solicitud) : Promise.resolve(null);
