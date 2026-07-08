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
