import { applyDecorators } from '@nestjs/common';
import { ApiHeader, ApiSecurity } from '@nestjs/swagger';

export function ApiInternalEndpoint() {
  return applyDecorators(
    ApiSecurity('internal-api-key'),
    ApiHeader({
      name: 'x-internal-api-key',
      description: 'Clave interna de invoice.api',
      required: true,
      example: 'internal_pass1234',
    }),
  );
}
