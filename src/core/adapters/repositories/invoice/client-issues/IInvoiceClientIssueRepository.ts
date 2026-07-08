import type {
  GetInvoiceClientIssueByTlqvCodeCommand,
  GetInvoiceClientIssueByTlqvCodeResponse,
  GetInvoiceClientIssueSnapshotCommand,
  InvoiceClientIssueSnapshot,
  UpsertInvoiceClientIssueCommand,
} from '../../../../entities/invoice/client-issues/InvoiceClientIssue';

export interface IInvoiceClientIssueRepository {
  upsert(command: UpsertInvoiceClientIssueCommand): Promise<void>;

  getSnapshot(
    command?: GetInvoiceClientIssueSnapshotCommand,
  ): Promise<InvoiceClientIssueSnapshot>;

  getByTlqvCode(
    command: GetInvoiceClientIssueByTlqvCodeCommand,
  ): Promise<GetInvoiceClientIssueByTlqvCodeResponse>;
}
