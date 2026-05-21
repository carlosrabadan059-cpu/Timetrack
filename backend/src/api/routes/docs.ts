import { Hono } from 'hono';
import type { Context } from 'hono';

const docs = new Hono();

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'TimeTrack External API',
    version: '1.0.0',
    description: [
      '## Manual de Integración — API REST Externa (M2M)',
      '',
      'API diseñada para desarrolladores y administradores de sistemas que necesitan integrar',
      'plataformas de terceros (ERPs, nóminas, CRMs, herramientas de RRHH) con TimeTrack',
      'para automatizar la extracción de fichajes.',
      '',
      '### Autenticación',
      'Todas las peticiones deben realizarse por **HTTPS** e incluir la cabecera:',
      '```',
      'Authorization: Bearer tt_live_<tu_api_key>',
      'Content-Type: application/json',
      '```',
      '',
      '### Obtención de credenciales',
      '1. Inicia sesión con una cuenta de rol **Administrador** o **Manager**.',
      '2. Ve a **Ajustes → API Keys**.',
      '3. Crea una nueva API Key con un nombre identificativo y fecha de expiración opcional.',
      '4. Copia la clave generada — comienza por `tt_live_`. **No se puede recuperar después.**',
      '',
      '### Códigos de error',
      '| Código HTTP | Significado |',
      '|-------------|-------------|',
      '| 400 | Parámetros incorrectos o formato de API Key inválido |',
      '| 401 | API Key ausente, incorrecta o expirada |',
      '| 403 | API Key desactivada o empresa no coincide |',
      '| 429 | Límite de tasa excedido |',
      '| 500 | Error interno del servidor |',
    ].join('\n'),
    contact: { email: 'soporte@rabadanhouse.space' },
  },
  servers: [{ url: 'https://api.rabadanhouse.space', description: 'Producción' }],
  security: [{ ApiKeyAuth: [] }],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'tt_live_...',
        description:
          'API Key emitida desde el panel de administración. ' +
          'Se almacena hasheada (SHA-256) y no puede recuperarse tras su creación.',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string', example: 'unauthorized' },
              message: { type: 'string', example: 'API Key inválida o inexistente' },
              details: { description: 'Detalles adicionales del error (solo en 400).' },
            },
          },
        },
      },
      FichajeMeta: {
        type: 'object',
        required: ['page', 'total', 'has_more'],
        properties: {
          page: { type: 'integer', example: 1 },
          total: { type: 'integer', example: 142, description: 'Total de registros que cumplen el filtro.' },
          has_more: { type: 'boolean', example: true, description: 'Indica si hay más páginas disponibles.' },
        },
      },
      FichajeUser: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: '0287c785-37c2-4254-95de-85f920168a20' },
          full_name: { type: 'string', example: 'Rodolfo Marquez' },
          email: { type: 'string', format: 'email', example: 'rodolfo@rabadanhouse.space' },
          employee_code: { type: 'string', example: 'EMP-0001' },
        },
      },
      Fichaje: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: '7ca64b4c-9f66-4eb9-a86d-625890adcb84' },
          user: { $ref: '#/components/schemas/FichajeUser' },
          direction: {
            type: 'string',
            enum: ['in', 'out'],
            description: '`in` = entrada, `out` = salida.',
          },
          detail_type: {
            type: 'string',
            enum: ['normal', 'comida', 'descanso', 'medico', 'otro'],
            description: 'Tipo de fichaje. Se infiere por hora si no se indica: 13–16h → `comida`, resto → `normal`.',
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            example: '2026-05-20T09:00:00.000Z',
          },
          source: {
            type: 'string',
            enum: ['web', 'mobile', 'signalr', 'correction'],
            description: 'Origen técnico del fichaje.',
          },
          source_human: {
            type: 'string',
            example: 'Lector Físico 2N',
            description: 'Etiqueta legible del origen. Valores: `App Web`, `App Móvil`, `Lector Físico 2N`, `Corrección`.',
          },
          device_info: {
            type: 'string',
            nullable: true,
            example: 'Lector Principal Entrada',
            description: 'Identificador del dispositivo de origen (nombre del lector 2N, `web`, `ios` o `android`).',
          },
          latitude: { type: 'number', nullable: true, example: null },
          longitude: { type: 'number', nullable: true, example: null },
          corrected: {
            type: 'boolean',
            description: '`true` si el fichaje fue creado al aprobar una incidencia de tipo `olvido`.',
          },
        },
      },
    },
  },
  paths: {
    '/api/external/v1/fichajes': {
      get: {
        summary: 'Listar fichajes',
        description:
          'Devuelve los fichajes (entradas y salidas) de los empleados de la empresa asociada a la API Key, ' +
          'paginados y ordenados por `timestamp` descendente. ' +
          'Todos los filtros son opcionales y combinables.',
        operationId: 'getFichajes',
        tags: ['Fichajes'],
        parameters: [
          {
            name: 'company_name',
            in: 'query',
            description:
              'Nombre de la empresa para validación cruzada y seguridad multi-tenant explícita ' +
              '(ej. `RabadanHouse`). Si se indica y no coincide con la empresa de la API Key, devuelve 403.',
            schema: { type: 'string', example: 'RabadanHouse' },
          },
          {
            name: 'employee_code',
            in: 'query',
            description: 'Código legible del empleado (ej. `EMP-0001`). Filtra por un empleado concreto.',
            schema: { type: 'string', example: 'EMP-0001' },
          },
          {
            name: 'user_id',
            in: 'query',
            description: 'UUID del empleado en Supabase. Alternativa a `employee_code`.',
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'start_date',
            in: 'query',
            description: 'Fecha/hora de inicio del rango (ISO 8601 UTC con milisegundos).',
            schema: { type: 'string', format: 'date-time', example: '2026-05-01T00:00:00.000Z' },
          },
          {
            name: 'end_date',
            in: 'query',
            description: 'Fecha/hora de fin del rango (ISO 8601 UTC con milisegundos).',
            schema: { type: 'string', format: 'date-time', example: '2026-05-20T23:59:59.999Z' },
          },
          {
            name: 'source',
            in: 'query',
            description:
              'Origen del fichaje. ' +
              '`web` = botón app web, `mobile` = app móvil, `signalr` = lector físico 2N, `correction` = corrección aprobada.',
            schema: { type: 'string', enum: ['web', 'mobile', 'signalr', 'correction'] },
          },
          {
            name: 'page',
            in: 'query',
            description: 'Número de página (comienza en 1).',
            schema: { type: 'integer', default: 1, minimum: 1 },
          },
          {
            name: 'limit',
            in: 'query',
            description: 'Registros por página. Por defecto 50, máximo 100.',
            schema: { type: 'integer', default: 50, minimum: 1, maximum: 100 },
          },
        ],
        responses: {
          '200': {
            description: 'Lista paginada de fichajes.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/Fichaje' } },
                    meta: { $ref: '#/components/schemas/FichajeMeta' },
                  },
                },
                example: {
                  data: [
                    {
                      id: '7ca64b4c-9f66-4eb9-a86d-625890adcb84',
                      user: {
                        id: '0287c785-37c2-4254-95de-85f920168a20',
                        full_name: 'Rodolfo Marquez',
                        email: 'rodolfo@rabadanhouse.space',
                        employee_code: 'EMP-0001',
                      },
                      direction: 'in',
                      detail_type: 'normal',
                      timestamp: '2026-05-20T09:00:00.000Z',
                      source: 'signalr',
                      source_human: 'Lector Físico 2N',
                      device_info: 'Lector Principal Entrada',
                      latitude: null,
                      longitude: null,
                      corrected: false,
                    },
                  ],
                  meta: { page: 1, total: 1, has_more: false },
                },
              },
            },
          },
          '400': {
            description: 'Parámetros de consulta incorrectos o formato de API Key inválido.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '401': {
            description: 'API Key ausente o inválida.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '403': {
            description: 'API Key desactivada, expirada, o `company_name` no coincide con la empresa de la API Key.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '429': {
            description: 'Límite de tasa excedido.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '500': {
            description: 'Error interno del servidor.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
  },
};

docs.get('/openapi.json', (c: Context) => c.json(spec));

docs.get('/docs', (c: Context) => {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TimeTrack API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    body { margin: 0; }
    .swagger-ui .topbar { background: #0D0D16; }
    .swagger-ui .topbar .download-url-wrapper { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/openapi.json',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'BaseLayout',
      deepLinking: true,
      tryItOutEnabled: true,
      persistAuthorization: true,
    });
  </script>
</body>
</html>`;
  return c.html(html);
});

export default docs;
