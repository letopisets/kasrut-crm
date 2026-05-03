import swaggerJsdoc from 'swagger-jsdoc'
import { env } from '../config/env'

const localApiUrl = 'http://localhost:3000/api'
const servers = [
  { url: env.API_PUBLIC_URL, description: 'Production' },
]

if (process.env.NODE_ENV !== 'production' && env.API_PUBLIC_URL !== localApiUrl) {
  servers.push({ url: localApiUrl, description: 'Local development' })
}

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title:   'KashrutCRM API',
      version: '1.0.0',
      description:
        'REST API for kashrut certification management. ' +
        'Backend for kasrut-crm (admin) and kasrut-map (public) clients.',
    },
    servers,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        Page: {
          type: 'object',
          properties: {
            items:      { type: 'array', items: {} },
            nextCursor: { type: 'string', nullable: true },
          },
          required: ['items', 'nextCursor'],
        },
        Restaurant: {
          type: 'object',
          properties: {
            id:         { type: 'string', format: 'uuid' },
            name:       { type: 'string' },
            address:    { type: 'string' },
            city:       { type: 'string' },
            level:      { type: 'string', enum: ['Regular', 'Mehadrin'] },
            hechsherId: { type: 'string', format: 'uuid' },
            mashgiachId:{ type: 'string', format: 'uuid', nullable: true },
            kitniyot:   { type: 'string' },
            expires:    { type: 'string', format: 'date' },
            status:     { type: 'string', enum: ['ok', 'warning', 'critical'] },
            rabbanutId: { type: 'string', format: 'uuid' },
            notes:      { type: 'string', nullable: true },
            lastInspection: { type: 'string', format: 'date', nullable: true },
          },
        },
        Inspection: {
          type: 'object',
          properties: {
            id:           { type: 'string', format: 'uuid' },
            restaurantId: { type: 'string', format: 'uuid' },
            mashgiachId:  { type: 'string', format: 'uuid' },
            date:         { type: 'string', format: 'date' },
            type:         { type: 'string', enum: ['planned', 'urgent'] },
            result:       { type: 'string', enum: ['pending', 'open', 'pass', 'fail'] },
            notes:        { type: 'string', nullable: true },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: { error: { type: 'string' } },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      '/health': {
        get: {
          tags: ['System'],
          summary: 'Health check',
          security: [],
          responses: {
            200: {
              description: 'Service is up',
              content: { 'application/json': { schema: { type: 'object' } } },
            },
          },
        },
      },
      '/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Email + password login (issues JWT or 2FA temp token)',
          security: [],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: {
              type: 'object',
              properties: {
                email:    { type: 'string', format: 'email' },
                password: { type: 'string' },
              },
              required: ['email', 'password'],
            } } },
          },
          responses: {
            200: { description: 'Token (or tempToken when 2FA required)' },
            400: { description: 'Invalid request' },
            401: { description: 'Invalid credentials' },
          },
        },
      },
      '/restaurants': {
        get: {
          tags: ['Restaurants'],
          summary: 'List restaurants. Returns array by default; returns Page<Restaurant> when `limit` is provided.',
          parameters: [
            { name: 'rabbanutId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'status',     in: 'query', schema: { type: 'string', enum: ['ok','warning','critical'] } },
            { name: 'limit',      in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200 } },
            { name: 'cursor',     in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            200: {
              description: 'Restaurant list (array OR paginated page)',
              content: {
                'application/json': {
                  schema: {
                    oneOf: [
                      { type: 'array', items: { $ref: '#/components/schemas/Restaurant' } },
                      {
                        allOf: [
                          { $ref: '#/components/schemas/Page' },
                          { type: 'object', properties: {
                            items: { type: 'array', items: { $ref: '#/components/schemas/Restaurant' } },
                          } },
                        ],
                      },
                    ],
                  },
                },
              },
            },
            400: { description: 'Invalid pagination input' },
          },
        },
      },
      '/inspections': {
        get: {
          tags: ['Inspections'],
          summary: 'List inspections (paginated when `limit` is provided)',
          parameters: [
            { name: 'restaurantId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'mashgiachId',  in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'result',       in: 'query', schema: { type: 'string', enum: ['pending','open','pass','fail'] } },
            { name: 'type',         in: 'query', schema: { type: 'string', enum: ['planned','urgent'] } },
            { name: 'limit',        in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200 } },
            { name: 'cursor',       in: 'query', schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'Inspection list' } },
        },
      },
    },
  },
  apis: [],
})
