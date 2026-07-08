import type { IInvoiceClientIssueRepository } from '../../adapters/repositories/invoice/client-issues/IInvoiceClientIssueRepository';
import type { IGetTusFacturasAfipInfoRepository } from '../../adapters/repositories/tus-facturas/afip-info/IGetTusFacturasAfipInfoRepository';
import type {
  GetTusFacturasAfipInfoCommand,
  GetTusFacturasAfipInfoResponse,
} from '../../entities/tus-facturas/afip-info/TusFacturasAfipInfo';

export class GetTusFacturasAfipInfoInteractor {
  constructor(
    private readonly tusFacturasAfipInfoRepository: IGetTusFacturasAfipInfoRepository,
    private readonly invoiceClientIssueRepository?: IInvoiceClientIssueRepository,
    private readonly getNow: () => Date = () => new Date(),
  ) {}

  async execute(
    command: GetTusFacturasAfipInfoCommand,
  ): Promise<GetTusFacturasAfipInfoResponse> {
    const response =
      await this.tusFacturasAfipInfoRepository.getAfipInfo(command);

    if (
      response.status === 'invalid_document' &&
      command.tlqvCode !== undefined &&
      command.tlqvCode.trim() !== '' &&
      this.invoiceClientIssueRepository !== undefined
    ) {
      await this.invoiceClientIssueRepository.upsert({
        tlqvCode: command.tlqvCode.trim(),
        reason: 'INVALID_FISCAL_DOCUMENT',
        source: 'tus_facturas',
        saleNumber: command.issueContext?.saleNumber,
        buyerName: command.issueContext?.buyerName,
        email: command.issueContext?.email,
        cuit: response.invalidDocument.documentoNro,
        documentoTipo: response.invalidDocument.documentoTipo,
        message: response.invalidDocument.message,
        messages: response.invalidDocument.messages,
        rawPayload: response.invalidDocument.rawPayload,
        metadata: command.issueContext?.metadata,
        now: this.getNow(),
      });
    }

    return response;
  }
}
