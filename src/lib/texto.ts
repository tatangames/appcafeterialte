/**
 * Texto listo para comparar en un buscador: minúsculas y sin tildes,
 * así "azucar" encuentra "Azúcar" y "cafe" encuentra "Café".
 */
export const sinTildes = (texto: string): string =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
