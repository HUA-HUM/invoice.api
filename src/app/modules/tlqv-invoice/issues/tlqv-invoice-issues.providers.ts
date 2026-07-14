import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IInvoiceClientIssueRepository } from '../../../../core/adapters/repositories/invoice/client-issues/IInvoiceClientIssueRepository';
import { createMadreInvoiceClientIssuesRepository } from '../../shared/madre/madre-repositories.factory';

export const INVOICE_CLIENT_ISSUES_REPOSITORY = Symbol(
  'INVOICE_CLIENT_ISSUES_REPOSITORY',
);

export const invoiceClientIssuesRepositoryProvider: Provider<IInvoiceClientIssueRepository> =
  {
    provide: INVOICE_CLIENT_ISSUES_REPOSITORY,
    inject: [ConfigService],
    useFactory: (configService: ConfigService) =>
      createMadreInvoiceClientIssuesRepository(configService),
  };
