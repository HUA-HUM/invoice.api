import { Module } from '@nestjs/common';
import { TlqvInvoiceFacturasController } from '../../../controllers/tlqv-invoice-facturas.controller';
import { TlqvInvoiceFacturasBulkQueueService } from '../../../services/tlqv-invoice-facturas-bulk-queue.service';
import { TlqvInvoiceFacturasService } from '../../../services/tlqv-invoice-facturas.service';
import { InternalAuthModule } from '../../shared/internal-auth/internal-auth.module';
import { RedisInfrastructureModule } from '../../shared/redis/redis-infrastructure.module';
import { TlqvInvoiceClientesModule } from '../clientes/tlqv-invoice-clientes.module';
import { tlqvInvoiceFacturasInteractorProviders } from './tlqv-invoice-facturas.providers';

@Module({
  imports: [
    InternalAuthModule,
    RedisInfrastructureModule,
    TlqvInvoiceClientesModule,
  ],
  controllers: [TlqvInvoiceFacturasController],
  providers: [
    ...tlqvInvoiceFacturasInteractorProviders,
    TlqvInvoiceFacturasService,
    TlqvInvoiceFacturasBulkQueueService,
  ],
  exports: [TlqvInvoiceFacturasService, TlqvInvoiceFacturasBulkQueueService],
})
export class TlqvInvoiceFacturasModule {}
