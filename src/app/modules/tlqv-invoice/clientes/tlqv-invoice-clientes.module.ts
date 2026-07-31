import { Module } from '@nestjs/common';
import { TlqvInvoiceClientesController } from '../../../controllers/tlqv-invoice-clientes.controller';
import { TlqvInvoiceClientesService } from '../../../services/tlqv-invoice-clientes.service';
import { InternalAuthModule } from '../../shared/internal-auth/internal-auth.module';
import { StockBueTlqvCacheModule } from '../../stock-bue/cache/stock-bue-tlqv-cache.module';
import {
  CREATE_XUBIO_CLIENTE_FROM_TLQV_INTERACTOR,
  CREATE_XUBIO_CONSUMIDOR_FINAL_CLIENTE_FROM_ISSUE_INTERACTOR,
  tlqvInvoiceClientesInteractorProviders,
} from './tlqv-invoice-clientes.providers';

@Module({
  imports: [InternalAuthModule, StockBueTlqvCacheModule],
  controllers: [TlqvInvoiceClientesController],
  providers: [
    ...tlqvInvoiceClientesInteractorProviders,
    TlqvInvoiceClientesService,
  ],
  exports: [
    TlqvInvoiceClientesService,
    CREATE_XUBIO_CLIENTE_FROM_TLQV_INTERACTOR,
    CREATE_XUBIO_CONSUMIDOR_FINAL_CLIENTE_FROM_ISSUE_INTERACTOR,
  ],
})
export class TlqvInvoiceClientesModule {}
