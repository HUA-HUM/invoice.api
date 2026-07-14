import { Inject, Injectable } from '@nestjs/common';
import type { IInvoiceClientIssueRepository } from '../../core/adapters/repositories/invoice/client-issues/IInvoiceClientIssueRepository';
import type {
  GetInvoiceClientIssueByTlqvCodeResponse,
  InvoiceClientIssueReason,
  InvoiceClientIssueSnapshot,
} from '../../core/entities/invoice/client-issues/InvoiceClientIssue';
import { INVOICE_CLIENT_ISSUES_REPOSITORY } from '../modules/tlqv-invoice/issues/tlqv-invoice-issues.providers';

@Injectable()
export class TlqvInvoiceIssuesService {
  constructor(
    @Inject(INVOICE_CLIENT_ISSUES_REPOSITORY)
    private readonly repository: IInvoiceClientIssueRepository,
  ) {}

  getSnapshot(command: {
    reason?: InvoiceClientIssueReason;
    limit?: number;
  }): Promise<InvoiceClientIssueSnapshot> {
    return this.repository.getSnapshot(command);
  }

  getByTlqvCode(
    tlqvCode: string,
  ): Promise<GetInvoiceClientIssueByTlqvCodeResponse> {
    return this.repository.getByTlqvCode({ tlqvCode });
  }
}
