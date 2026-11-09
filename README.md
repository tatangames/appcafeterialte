# Panadería Eduardo · App de la tablet

App de la tablet, que es el punto de venta del negocio: mesas, venta de mostrador, caja y turnos, ventas, compras, gastos, inventario, producción y resumen del día. Usa la misma API que la web (`apicafeterialte`), así que lo que se hace aquí aparece en la web al instante y al revés.

Hecha con Expo SDK 58, Expo Router y React Native. Funciona en tablet horizontal o vertical.

## Qué hace

La tablet es el punto de venta del negocio: no hay computadora. Lo diario se hace en la app; lo descriptivo (reportes por periodo, configuración, recetas, usuarios) se abre en el navegador de la tablet con la web del sistema.

Después de entrar se ve el **menú principal**, con un acceso por módulo según los permisos de cada usuario.

| Módulo | Qué se hace |
|---|---|
| Mesas | Mapa de mesas (cian libre, rosa ocupada). En la mesa: personas, productos con extras y nota, cuentas separadas, **Enviar** (un ticket por área), precuenta en la térmica, cobro, mover productos, cobrar lo seleccionado, marcar entregado, reimprimir comandas, cambiar de mesa y liberar. |
| Venta rápida | Mostrador sin mesa: productos por categoría o búsqueda, carrito con − y +, cobro en efectivo con cambio, tarjeta o transferencia. Al cobrar salen el ticket y las comandas por área. Acepta consumo interno a $0.00. |
| Caja y turno | Fondo, ventas, ingresos y egresos, efectivo esperado, por forma de pago, por empleado, lista «Por comprar» y movimientos (los manuales se anulan con motivo). Botones de ingreso, egreso, gasto, corte X y **cerrar turno**, que cuenta billete por billete y muestra si cuadra, falta o sobra, e imprime el cierre. **Cambio de turno:** cerrar el turno y luego «Abrir el siguiente turno», donde quien entra se identifica con su PIN. |
| Ventas | Ventas de hoy, ayer o los últimos 7 días; detalle con productos y pagos; reimprimir el ticket y anular (del turno abierto, con motivo y PIN si hace falta). |
| Compras | Últimos 30 días con lo que se debe. Nueva compra: proveedor, documento, productos en la unidad del proveedor (quintal, galón, docena) con su costo, contado (de la caja o fuera de caja) o crédito. Entra al inventario y actualiza el costo. |
| Gastos | Gastos del mes y registro de uno nuevo por categoría, de la caja o fuera de caja. |
| Inventario | Existencias con búsqueda y filtros (en su mínimo, sin existencia). |
| Producción | Producción del día con las recetas (descuenta insumos y suma lo producido) y mermas del cierre del día (lo que no se vendió, con motivo). |
| Resumen del día | Ventas de hoy contra ayer, tickets, ticket promedio, ventas por hora, lo más vendido y alertas. |
| Caja de la tablet | Elegir la caja del dispositivo y abrir turno; muestra lo que dejó por comprar el turno anterior. |

Lo que pide autorización en la web pide aquí el PIN de un encargado (anular, cancelar algo ya enviado, liberar una mesa con pendientes).

Se hacen en la web (desde el navegador de la tablet): devoluciones de días anteriores, ventas al crédito y abonos, pedidos especiales, ajustes y conteo de inventario, kardex, recetas, órdenes de compra y pagos a proveedores, reportes con exportación, configuración, usuarios y permisos.

## Correr en desarrollo

```bash
npm install
```

```bash
npx expo start
```

Para verla en la tablet, instalar **Expo Go** y escanear el código QR. La tablet tiene que estar en el mismo Wi-Fi que la computadora.

Para verla en el navegador (pruebas):

```bash
npx expo start --web
```

## Instalar en la tablet (APK)

Se compila en la nube con EAS. Hace falta una cuenta gratuita de Expo.

```bash
npx eas-cli@latest build -p android --profile preview
```

La primera vez, el comando crea `eas.json` y pide iniciar sesión. Al terminar da un enlace para descargar el APK en la tablet.

## Antes de usarla

- **Servidor accesible en la red:** el servidor Laravel tiene que escuchar en la IP del local, no solo en `127.0.0.1`. Por ejemplo, en Laragon con el puerto 8080 abierto en el firewall de Windows.
- **Impresoras:** en la web, configura la impresora de tickets de la caja (Configuración › Impresoras) y las áreas de cada categoría (Configuración › Mesas y cocina › Áreas). Sin impresora, las comandas quedan registradas, pero no salen en papel.

## Revisar el código

```bash
npx tsc --noEmit
```

```bash
npx expo lint
```

## Estructura

- `src/app/`: pantallas (Expo Router): `index`, `servidor`, `login`, `caja`, `inicio` (menú), `mesas`, `mesa/[id]`, `venta`, `turno`, `ventas`, `ventas/[id]`, `compras`, `compras/nueva`, `gastos`, `inventario`, `produccion`, `resumen`.
- `src/components/`: interfaz táctil (`ui`), encabezado de módulo (`encabezado`), ventana de extras (`modificadores`) y de cobro (`cobro`).
- `src/lib/`: cliente de la API, servicios de mesas (`servicios`) y de la operación diaria (`operaciones`), tipos, sesión, PIN de autorización y almacenamiento (SecureStore en la tablet, `localStorage` en web).
