import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  TLQV_INVOICE_FLOW_STOP_AFTER_VALUES,
  type TlqvInvoiceFlowStopAfter,
} from '../../core/interactors/tlqv-invoice/facturas/CreateTlqvInvoiceFlowInteractor';
import { InternalApiKeyGuard } from '../guards/internal-api-key.guard';
import { ApiInternalEndpoint } from '../modules/shared/swagger/internal-api-docs.decorators';
import { TlqvInvoiceFacturasService } from '../services/tlqv-invoice-facturas.service';

@ApiTags('TLQV Invoice - Facturas')
@Controller('internal/tlqv-invoice/facturas')
@UseGuards(InternalApiKeyGuard)
export class TlqvInvoiceFacturasController {
  constructor(
    private readonly tlqvInvoiceFacturasService: TlqvInvoiceFacturasService,
  ) {}

  @ApiInternalEndpoint()
  @ApiOperation({
    summary: 'Crear factura Xubio desde un TLQV',
    description:
      'Interactor padre del flujo de facturación. Valida el TLQV, crea/valida cliente Xubio, obtiene la data fuente desde las solapas TLQV y MADRE, arma el payload y emite la factura cuando dryRun=false.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['tlqvCode'],
      properties: {
        tlqvCode: {
          type: 'string',
          example: 'TLQV-1569',
        },
        stopAfter: {
          type: 'string',
          enum: [...TLQV_INVOICE_FLOW_STOP_AFTER_VALUES],
          default: 'source_data',
          description:
            'Permite cortar el flujo para debuggear paso por paso.',
        },
        dryRun: {
          type: 'boolean',
          default: true,
          description:
            'Cuando es true, nunca emite la factura aunque stopAfter sea invoice_creation.',
        },
      },
      example: {
        tlqvCode: 'TLQV-1569',
        stopAfter: 'source_data',
        dryRun: true,
      },
    },
  })
  @ApiOkResponse({
    description: 'Flujo completado hasta la etapa solicitada o bloqueado.',
    schema: {
      example: {
        status: 'completed',
        canContinue: true,
        tlqvCode: 'TLQV-1569',
        stopAfter: 'source_data',
        dryRun: true,
        steps: [
          {
            name: 'client',
            status: 'completed',
            message: 'Cliente creado en Xubio.',
          },
          {
            name: 'source_data',
            status: 'completed',
            message: 'Datos obtenidos desde solapas TLQV y MADRE.',
          },
        ],
        xubioClienteId: 10270718,
        nextStep: 'invoice_creation',
      },
    },
  })
  @Post('create-from-tlqv')
  createFromTlqv(
    @Body()
    body: {
      tlqvCode?: string;
      stopAfter?: string;
      dryRun?: boolean;
    } = {},
  ) {
    return this.tlqvInvoiceFacturasService.createFromTlqv({
      tlqvCode: readRequiredBodyString(body.tlqvCode, 'tlqvCode'),
      stopAfter: readOptionalStopAfter(body.stopAfter),
      dryRun: readOptionalBoolean(body.dryRun, 'dryRun'),
    });
  }

  @ApiInternalEndpoint()
  @ApiOperation({
    summary: 'Eliminar factura Xubio por transacción',
    description:
      'Elimina un comprobante de venta en Xubio usando el transaccionId devuelto por el endpoint de creación. Útil para pruebas controladas antes de pedir CAE.',
  })
  @ApiOkResponse({
    description: 'Factura eliminada en Xubio.',
    schema: {
      example: {
        transaccionId: 75226596,
        deleted: true,
      },
    },
  })
  @Delete(':transaccionId')
  deleteByTransaccionId(@Param('transaccionId') transaccionId: string) {
    return this.tlqvInvoiceFacturasService.deleteByTransaccionId({
      transaccionId: readRequiredPositiveInteger(
        transaccionId,
        'transaccionId',
      ),
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

function readOptionalStopAfter(
  value: string | undefined,
): TlqvInvoiceFlowStopAfter | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }

  const normalized = value.trim();
  if (
    !TLQV_INVOICE_FLOW_STOP_AFTER_VALUES.includes(
      normalized as TlqvInvoiceFlowStopAfter,
    )
  ) {
    throw new BadRequestException(
      `stopAfter must be one of: ${TLQV_INVOICE_FLOW_STOP_AFTER_VALUES.join(', ')}`,
    );
  }

  return normalized as TlqvInvoiceFlowStopAfter;
}

function readOptionalBoolean(
  value: boolean | undefined,
  field: string,
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new BadRequestException(`${field} must be a boolean`);
  }

  return value;
}

function readRequiredPositiveInteger(value: string, field: string): number {
  const numberValue = Number(value.trim());
  if (!Number.isInteger(numberValue) || numberValue < 1) {
    throw new BadRequestException(`${field} must be a positive integer`);
  }

  return numberValue;
}
