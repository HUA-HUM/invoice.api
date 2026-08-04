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
import {
  INVOICE_CLIENT_ISSUE_REASONS,
  type InvoiceClientIssueReason,
  type InvoiceClientIssueStatus,
} from '../../core/entities/invoice/client-issues/InvoiceClientIssue';
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
    enum: INVOICE_CLIENT_ISSUE_REASONS,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 100,
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['open', 'resolved', 'ignored'],
    example: 'open',
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
  getIssues(
    @Query('reason') reason?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.tlqvInvoiceIssuesService.getSnapshot({
      reason: parseOptionalReason(reason),
      status: parseOptionalStatus(status),
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
    !INVOICE_CLIENT_ISSUE_REASONS.includes(value as InvoiceClientIssueReason)
  ) {
    throw new BadRequestException(
      'reason must be a known invoice client issue reason',
    );
  }

  return value as InvoiceClientIssueReason;
}

function parseOptionalStatus(
  value: string | undefined,
): InvoiceClientIssueStatus | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }

  const normalizedValue = value.trim();
  if (
    normalizedValue !== 'open' &&
    normalizedValue !== 'resolved' &&
    normalizedValue !== 'ignored'
  ) {
    throw new BadRequestException('status must be open, resolved or ignored');
  }

  return normalizedValue;
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
