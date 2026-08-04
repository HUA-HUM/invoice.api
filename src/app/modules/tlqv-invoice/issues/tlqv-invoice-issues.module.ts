import { Module } from '@nestjs/common';
import { TlqvInvoiceIssuesController } from '../../../controllers/tlqv-invoice-issues.controller';
import { TlqvInvoiceIssuesService } from '../../../services/tlqv-invoice-issues.service';
import { InternalAuthModule } from '../../shared/internal-auth/internal-auth.module';
import {
  INVOICE_CLIENT_ISSUES_REPOSITORY,
  invoiceClientIssuesRepositoryProvider,
} from './tlqv-invoice-issues.providers';

@Module({
  imports: [InternalAuthModule],
  controllers: [TlqvInvoiceIssuesController],
  providers: [invoiceClientIssuesRepositoryProvider, TlqvInvoiceIssuesService],
  exports: [INVOICE_CLIENT_ISSUES_REPOSITORY, TlqvInvoiceIssuesService],
})
export class TlqvInvoiceIssuesModule {}
