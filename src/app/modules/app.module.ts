import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from '../controllers/app.controller';
import { AppService } from '../services/app.service';
import { StockBueModule } from './stock-bue/stock-bue.module';
import { TlqvInvoiceClientesModule } from './tlqv-invoice/clientes/tlqv-invoice-clientes.module';
import { TlqvInvoiceDocumentsModule } from './tlqv-invoice/documents/tlqv-invoice-documents.module';
import { TlqvInvoiceIssuesModule } from './tlqv-invoice/issues/tlqv-invoice-issues.module';
import { TlqvInvoicePreparationModule } from './tlqv-invoice/preparation/tlqv-invoice-preparation.module';
import { TusFacturasModule } from './tus-facturas/tus-facturas.module';
import { XubioClientesModule } from './xubio/clientes/xubio-clientes.module';
import { XubioComprobantesModule } from './xubio/comprobantes/xubio-comprobantes.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    StockBueModule,
    TlqvInvoiceClientesModule,
    TlqvInvoiceDocumentsModule,
    TlqvInvoiceIssuesModule,
    TlqvInvoicePreparationModule,
    TusFacturasModule,
    XubioClientesModule,
    XubioComprobantesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
