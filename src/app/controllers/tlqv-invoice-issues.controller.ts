import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { InvoiceClientIssueReason } from '../../core/entities/invoice/client-issues/InvoiceClientIssue';
import { InternalApiKeyGuard } from '../guards/internal-api-key.guard';
import { TlqvInvoiceIssuesService } from '../services/tlqv-invoice-issues.service';

@Controller('internal/tlqv-invoice/issues')
@UseGuards(InternalApiKeyGuard)
export class TlqvInvoiceIssuesController {
  constructor(
    private readonly tlqvInvoiceIssuesService: TlqvInvoiceIssuesService,
  ) {}

  @Get()
  getIssues(@Query('reason') reason?: string, @Query('limit') limit?: string) {
    return this.tlqvInvoiceIssuesService.getSnapshot({
      reason: parseOptionalReason(reason),
      limit: parseOptionalPositiveInteger(limit, 'limit'),
    });
  }

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
