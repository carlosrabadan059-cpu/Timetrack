# Manual de Integración — API REST Externa (M2M)

Este manual técnico está diseñado para desarrolladores y administradores de sistemas que necesitan integrar plataformas de terceros (como ERPs, nóminas, CRMs o herramientas de recursos humanos) con **Antigravity / TimeTrack** para automatizar la extracción de fichajes (*access logs*).

---

## 1. Obtención de Credenciales (API Key)

Para poder consumir la API, necesitas una clave de API válida vinculada a tu empresa.

1.  Inicia sesión en la plataforma con una cuenta de rol **Administrador** o **Manager**.
2.  Dirígete a la sección de **Ajustes de Empresa** o **API Keys**.
3.  Crea una nueva API Key proporcionando un nombre identificativo (ej: `Integración ERP SAP`) y una fecha de expiración si lo consideras necesario.
4.  **IMPORTANTE**: Copia la clave secreta generada en ese mismo instante. Sigue el formato `tt_live_...`. Por motivos de seguridad, la clave se hashea usando SHA-256 antes de guardarse en la base de datos y **no podrá ser visualizada de nuevo**.

---

## 2. Autenticación y Cabeceras

Todas las peticiones a la API externa deben realizarse mediante conexiones seguras HTTPS y deben incluir la cabecera estándar `Authorization` utilizando el esquema `Bearer`:

```http
Authorization: Bearer tt_live_852a6cc548c9c2b9fb2dd23ce521e318
Content-Type: application/json
```

---

## 3. Especificación de Endpoints

### `GET /api/external/v1/fichajes`

Obtiene la lista de fichajes (*access logs*) correspondientes a tu empresa de forma paginada.

#### Parámetros de Consulta (Query Params)

| Parámetro | Tipo | Requerido | Descripción |
| :--- | :--- | :--- | :--- |
| `company_name` | `string` | No | Nombre de la empresa para validación cruzada y seguridad multi-tenant explícita (ej. `RabadanHouse`). |
| `start_date` | `string` | No | Fecha/Hora de inicio en formato ISO-8601 UTC (ej. `2026-05-01T00:00:00.000Z`). |
| `end_date` | `string` | No | Fecha/Hora de fin en formato ISO-8601 UTC (ej. `2026-05-20T23:59:59.999Z`). |
| `employee_code` | `string` | No | Código legible del empleado asignado por la plataforma (ej. `EMP-0001`). |
| `user_id` | `uuid` | No | ID único (UUID de Supabase) del empleado si lo conoces en tu base de datos externa. |
| `source` | `string` | No | Origen del fichaje: `web` (botón), `mobile` (app móvil), `signalr` (lector físico 2N), `correction`. |
| `page` | `integer` | No | Número de página a consultar. Por defecto `1`. |
| `limit` | `integer` | No | Registros por página. Por defecto `50` (máximo `100`). |

#### Ejemplo de Respuesta Correcta (`200 OK`)

```json
{
  "data": [
    {
      "id": "7ca64b4c-9f66-4eb9-a86d-625890adcb84",
      "user": {
        "id": "0287c785-37c2-4254-95de-85f920168a20",
        "full_name": "Rodolfo Marquez",
        "email": "rodolfo@rabadanhouse.space",
        "employee_code": "EMP-0001"
      },
      "direction": "in",
      "detail_type": "normal",
      "timestamp": "2026-05-20T09:00:00.000Z",
      "source": "signalr",
      "source_human": "Lector Físico 2N",
      "device_info": "Lector Principal Entrada",
      "latitude": null,
      "longitude": null,
      "corrected": false
    }
  ],
  "meta": {
    "page": 1,
    "total": 1,
    "has_more": false
  }
}
```

---

## 4. Ejemplos de Implementación en Múltiples Lenguajes

A continuación, tienes fragmentos de código listos para su uso. Recuerda sustituir la URL base (`http://localhost:3000` o la de tu servidor de producción) y tu `API_KEY` real.

````carousel
```bash
# === BASH / cURL ===
curl -i -X GET \
  -H "Authorization: Bearer tt_live_TU_API_KEY_AQUI" \
  -H "Content-Type: application/json" \
  "http://localhost:3000/api/external/v1/fichajes?limit=5&source=signalr"
```
<!-- slide -->
```javascript
// === JAVASCRIPT / TYPESCRIPT (Fetch) ===
const API_KEY = "tt_live_TU_API_KEY_AQUI";
const BASE_URL = "http://localhost:3000";

async function fetchLogs() {
  const queryParams = new URLSearchParams({
    limit: '10',
    start_date: '2026-05-01T00:00:00.000Z'
  });

  try {
    const response = await fetch(`${BASE_URL}/api/external/v1/fichajes?${queryParams}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errBody = await response.json();
      throw new Error(`HTTP Error ${response.status}: ${errBody.error?.message}`);
    }

    const { data, meta } = await response.json();
    console.log(`Registros obtenidos: ${data.length}`, data);
  } catch (error) {
    console.error('Error al consultar la API:', error.message);
  }
}

fetchLogs();
```
<!-- slide -->
```python
# === PYTHON (Requests) ===
import requests

API_KEY = "tt_live_TU_API_KEY_AQUI"
BASE_URL = "http://localhost:3000/api/external/v1/fichajes"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

params = {
    "limit": 20,
    "employee_code": "EMP-0001"
}

try:
    response = requests.get(BASE_URL, headers=headers, params=params, timeout=10)
    response.raise_for_status()
    
    payload = response.json()
    logs = payload.get("data", [])
    print(f"Éxito: Se obtuvieron {len(logs)} fichajes.")
    for l in logs:
        print(f"[{l['timestamp']}] {l['user']['full_name']} -> {l['direction'].upper()} ({l['source_human']})")
except requests.exceptions.HTTPError as err:
    print(f"Error HTTP: {response.status_code} - {response.json().get('error', {}).get('message')}")
except Exception as err:
    print(f"Ocurrió un error inesperado: {err}")
```
<!-- slide -->
```php
<?php
// === PHP (cURL) ===

$apiKey = "tt_live_TU_API_KEY_AQUI";
$url = "http://localhost:3000/api/external/v1/fichajes?limit=5";

$ch = curl_init();

curl_setopt_array($ch, [
    CURLOPT_URL => $url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer " . $apiKey,
        "Content-Type: application/json"
    ],
    CURLOPT_TIMEOUT => 10
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

if (curl_errno($ch)) {
    echo 'Error de curl: ' . curl_error($ch);
} else {
    if ($httpCode === 200) {
        $result = json_decode($response, true);
        echo "Fichajes recibidos:\n";
        print_r($result['data']);
    } else {
        echo "Error en la petición API. Código HTTP: " . $httpCode . "\n";
        echo "Respuesta: " . $response . "\n";
    }
}

curl_close($ch);
?>
```
<!-- slide -->
```csharp
// === C# (.NET HttpClient) ===
using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading.Tasks;

class Program
{
    private static readonly HttpClient client = new HttpClient();

    static async Task Main(string[] args)
    {
        string apiKey = "tt_live_TU_API_KEY_AQUI";
        string url = "http://localhost:3000/api/external/v1/fichajes?limit=5";

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        try
        {
            HttpResponseMessage response = await client.GetAsync(url);
            string responseString = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
            {
                Console.WriteLine("Petición exitosa:");
                Console.WriteLine(responseString);
            }
            else
            {
                Console.WriteLine($"Error API: {response.StatusCode}");
                Console.WriteLine(responseString);
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Excepción: {ex.Message}");
        }
    }
}
```
````

---

## 5. Control de Errores Comunes

La API responde utilizando códigos de estado HTTP estándar. A continuación se detallan los códigos más comunes y su significado:

*   **`400 Bad Request`**: Parámetros de consulta erróneos, fechas mal formateadas o formato de API Key inválido.
    *   *Ejemplo*: Si la clave no comienza con `tt_live_`.
*   **`401 Unauthorized`**: API Key ausente, incorrecta o expirada.
*   **`403 Forbidden`**: La clave ha sido desactivada temporal o permanentemente por un administrador.
*   **`429 Too Many Requests`**: Límite de tasa excedido. Se permite un volumen de peticiones adaptado al uso empresarial estándar.
*   **`500 Internal Server Error`**: Ocurrió una anomalía en el servidor. El equipo técnico de la plataforma registrará el incidente de forma automática para su pronta resolución.

---
