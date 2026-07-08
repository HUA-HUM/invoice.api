import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InternalApiKeyGuard } from '../guards/internal-api-key.guard';
import { TlqvInvoiceClientesService } from '../services/tlqv-invoice-clientes.service';

@Controller('internal/tlqv-invoice/clientes')
@UseGuards(InternalApiKeyGuard)
export class TlqvInvoiceClientesController {
  constructor(
    private readonly tlqvInvoiceClientesService: TlqvInvoiceClientesService,
  ) {}

  @Post('create-from-tlqv')
  createFromTlqv(@Body() body: { tlqvCode?: string } = {}) {
    return this.tlqvInvoiceClientesService.execute({
      tlqvCode: readRequiredBodyString(body.tlqvCode, 'tlqvCode'),
    });
  }

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
