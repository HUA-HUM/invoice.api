import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { InvoiceClientIssueReason } from '../../core/entities/invoice/client-issues/InvoiceClientIssue';
import { InternalApiKeyGuard } from '../guards/internal-api-key.guard';
import { ApiInternalEndpoint } from '../modules/shared/swagger/internal-api-docs.decorators';
import { TlqvInvoiceIssuesService } from '../services/tlqv-invoice-issues.service';

@ApiTags('TLQV Invoice - Issues')
@Controller('internal/tlqv-invoice/issues')
@UseGuards(InternalApiKeyGuard)
export class TlqvInvoiceIssuesController {
  constructor(
    private readonly tlqvInvoiceIssuesService: TlqvInvoiceIssuesService,
  ) {}

  @ApiInternalEndpoint()
  @ApiOperation({
    summary: 'Listar issues fiscales/clientes',
    description:
      'Consulta issues guardados en Madre API. Sirve para detectar CUIT inválido, cliente existente u otros bloqueos del flujo.',
  })
  @ApiQuery({
    name: 'reason',
    required: false,
    enum: [
      'INVALID_FISCAL_DOCUMENT',
      'XUBIO_CLIENT_ALREADY_EXISTS',
      'MISSING_BUYER_CUIT',
      'MISSING_FISCAL_RAZON_SOCIAL',
      'MISSING_FISCAL_CONDICION_IMPOSITIVA',
    ],
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 100,
  })
  @ApiOkResponse({
    description: 'Snapshot de issues.',
    schema: {
      example: {
        items: [
          {
            id: 123,
            tlqvCode: 'TLQV-7734',
            reason: 'INVALID_FISCAL_DOCUMENT',
            status: 'open',
            source: 'tus_facturas',
            message: 'No se ha podido recuperar la condicion frente al IVA.',
            occurrences: 1,
          },
        ],
      },
    },
  })
  @Get()
  getIssues(@Query('reason') reason?: string, @Query('limit') limit?: string) {
    return this.tlqvInvoiceIssuesService.getSnapshot({
      reason: parseOptionalReason(reason),
      limit: parseOptionalPositiveInteger(limit, 'limit'),
    });
  }

  @ApiInternalEndpoint()
  @ApiOperation({
    summary: 'Consultar issues por TLQV',
    description: 'Devuelve todos los issues asociados a un TLQV puntual.',
  })
  @ApiParam({
    name: 'tlqvCode',
    example: 'TLQV-7734',
  })
  @ApiOkResponse({
    description: 'Issues del TLQV.',
    schema: {
      example: {
        items: [
          {
            id: 123,
            tlqvCode: 'TLQV-7734',
            reason: 'INVALID_FISCAL_DOCUMENT',
            status: 'open',
          },
        ],
      },
    },
  })
  @Get(':tlqvCode')
  getIssuesByTlqvCode(@Param('tlqvCode') tlqvCode: string) {
    if (tlqvCode.trim() === '') {
      throw new BadRequestException('tlqvCode is required');
    }

    return this.tlqvInvoiceIssuesService.getByTlqvCode(tlqvCode.trim());
  }
}

function parseOptionalReason(
  value: string | undefined,
): InvoiceClientIssueReason | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }

  if (
    value !== 'INVALID_FISCAL_DOCUMENT' &&
    value !== 'XUBIO_CLIENT_ALREADY_EXISTS' &&
    value !== 'MISSING_BUYER_CUIT' &&
    value !== 'MISSING_FISCAL_RAZON_SOCIAL' &&
    value !== 'MISSING_FISCAL_CONDICION_IMPOSITIVA'
  ) {
    throw new BadRequestException(
      'reason must be a known invoice client issue reason',
    );
  }

  return value;
}

function parseOptionalPositiveInteger(
  value: string | undefined,
  field: string,
): number | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }

  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new BadRequestException(`${field} must be a positive integer`);
  }

  return parsedValue;
}
