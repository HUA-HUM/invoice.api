import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InternalApiKeyGuard } from '../guards/internal-api-key.guard';
import { ApiInternalEndpoint } from '../modules/shared/swagger/internal-api-docs.decorators';
import { TlqvInvoiceClientesService } from '../services/tlqv-invoice-clientes.service';

@ApiTags('TLQV Invoice - Clientes')
@Controller('internal/tlqv-invoice/clientes')
@UseGuards(InternalApiKeyGuard)
export class TlqvInvoiceClientesController {
  constructor(
    private readonly tlqvInvoiceClientesService: TlqvInvoiceClientesService,
  ) {}

  @ApiInternalEndpoint()
  @ApiOperation({
    summary: 'Crear cliente Xubio desde un TLQV',
    description:
      'Ejecuta el flujo completo: valida facturación/despachado, busca datos de orden en Ops API con fallback Flokzu, consulta Tus Facturas y crea el cliente en Xubio.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['tlqvCode'],
      properties: {
        tlqvCode: {
          type: 'string',
          example: 'TLQV-14921',
        },
      },
      example: {
        tlqvCode: 'TLQV-14921',
      },
    },
  })
  @ApiOkResponse({
    description: 'Cliente creado, existente o flujo bloqueado.',
    schema: {
      example: {
        status: 'created',
        canContinue: true,
        tlqvCode: 'TLQV-14921',
        documentoTipo: 'CUIT',
        fiscalInfo: {
          razonSocial: 'ARTURO GUTIERREZ',
          condicionImpositiva: 'MONOTRIBUTO',
          provincia: 'BUENOS AIRES',
        },
        xubioClienteResult: {
          status: 'created',
          created: true,
        },
      },
    },
  })
  @Post('create-from-tlqv')
  createFromTlqv(@Body() body: { tlqvCode?: string } = {}) {
    return this.tlqvInvoiceClientesService.execute({
      tlqvCode: readRequiredBodyString(body.tlqvCode, 'tlqvCode'),
    });
  }

  @ApiInternalEndpoint()
  @ApiOperation({
    summary: 'Crear cliente consumidor final desde issue fiscal',
    description:
      'Toma un issue INVALID_FISCAL_DOCUMENT guardado en Madre y crea el cliente en Xubio como consumidor final con identificación DNI/CF.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['tlqvCode'],
      properties: {
        tlqvCode: {
          type: 'string',
          example: 'TLQV-7734',
        },
        issueId: {
          oneOf: [{ type: 'number' }, { type: 'string' }],
          example: 123,
          description:
            'Opcional. Si no se envía, usa el issue abierto del TLQV.',
        },
        dni: {
          type: 'string',
          example: '44482399',
          description:
            'Opcional. Si no se envía, intenta derivarlo desde el documento del issue.',
        },
      },
      example: {
        tlqvCode: 'TLQV-7734',
        dni: '44482399',
      },
    },
  })
  @ApiOkResponse({
    description: 'Consumidor final creado, existente o bloqueado.',
    schema: {
      example: {
        status: 'created',
        canContinue: true,
        tlqvCode: 'TLQV-7734',
        dni: '44482399',
        usrCode: 'TLQV-20444823993',
        xubioClienteResult: {
          status: 'created',
          created: true,
        },
      },
    },
  })
  @Post('create-consumidor-final-from-issue')
  createConsumidorFinalFromIssue(
    @Body()
    body: {
      tlqvCode?: string;
      issueId?: number | string;
      dni?: string;
    } = {},
  ) {
    return this.tlqvInvoiceClientesService.createConsumidorFinalFromIssue({
      tlqvCode: readRequiredBodyString(body.tlqvCode, 'tlqvCode'),
      issueId: readOptionalPositiveInteger(body.issueId, 'issueId'),
      dni: readOptionalBodyString(body.dni),
    });
  }
}

function readRequiredBodyString(
  value: string | undefined,
  field: string,
): string {
  if (value === undefined || value.trim() === '') {
    throw new BadRequestException(`${field} is required`);
  }

  return value.trim();
}

function readOptionalBodyString(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }

  return value.trim();
}

function readOptionalPositiveInteger(
  value: number | string | undefined,
  field: string,
): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }

  const numberValue = typeof value === 'number' ? value : Number(value.trim());
  if (!Number.isInteger(numberValue) || numberValue < 1) {
    throw new BadRequestException(`${field} must be a positive integer`);
  }

  return numberValue;
}
