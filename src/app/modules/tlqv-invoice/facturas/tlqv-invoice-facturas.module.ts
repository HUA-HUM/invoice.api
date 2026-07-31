import { Module } from '@nestjs/common';
import { TlqvInvoiceFacturasController } from '../../../controllers/tlqv-invoice-facturas.controller';
import { TlqvInvoiceFacturasService } from '../../../services/tlqv-invoice-facturas.service';
import { InternalAuthModule } from '../../shared/internal-auth/internal-auth.module';
import { TlqvInvoiceClientesModule } from '../clientes/tlqv-invoice-clientes.module';
import { tlqvInvoiceFacturasInteractorProviders } from './tlqv-invoice-facturas.providers';

@Module({
  imports: [InternalAuthModule, TlqvInvoiceClientesModule],
  controllers: [TlqvInvoiceFacturasController],
  providers: [
    ...tlqvInvoiceFacturasInteractorProviders,
    TlqvInvoiceFacturasService,
  ],
})
export class TlqvInvoiceFacturasModule {}
