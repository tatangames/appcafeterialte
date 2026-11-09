package expo.modules.impresoratcp

import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException

// Abre una conexión TCP a la impresora (puerto 9100), escribe los bytes ya armados por el
// servidor y cierra. AsyncFunction corre fuera del hilo principal; un error rechaza la promesa.
class ImpresoraTcpModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ImpresoraTcp")

    AsyncFunction("enviar") { host: String, puerto: Int, base64: String, tiempoMs: Int ->
      val bytes = Base64.decode(base64, Base64.DEFAULT)
      Socket().use { socket ->
        socket.connect(InetSocketAddress(host, puerto), tiempoMs)
        socket.soTimeout = tiempoMs
        val salida = socket.getOutputStream()
        salida.write(bytes)
        salida.flush()
        // Las Star (TSP100 raster) descartan el trabajo si la conexión se cierra antes de que
        // terminen de recibirlo (igual que TransporteRed.php en el servidor): se espera a que la
        // impresora cierre o hasta 1.5 s. Lo que manda es su estado y se descarta.
        esperarCierre(socket, 1500)
      }
      bytes.size
    }
  }

  private fun esperarCierre(socket: Socket, maximoMs: Long) {
    val entrada = socket.getInputStream()
    val buffer = ByteArray(64)
    val hasta = System.currentTimeMillis() + maximoMs
    socket.soTimeout = 250
    try {
      while (System.currentTimeMillis() < hasta) {
        try {
          if (entrada.read(buffer) < 0) return // la impresora cerró: ya lo tiene
        } catch (e: SocketTimeoutException) {
          // sin datos todavía: seguir esperando hasta el máximo
        }
      }
    } catch (e: IOException) {
      // la conexión se cerró del otro lado: el trabajo ya se entregó
    }
  }
}
