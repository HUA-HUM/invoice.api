import type { IDeleteXubioInvoiceRepository } from '../../../adapters/repositories/xubio/facturas/IDeleteXubioInvoiceRepository';
import type {
  DeleteXubioInvoiceCommand,
  DeleteXubioInvoiceResponse,
} from '../../../entities/xubio/facturas/XubioInvoice';

export class DeleteXubioInvoiceInteractor {
  constructor(
    private readonly deleteXubioInvoiceRepository: IDeleteXubioInvoiceRepository,
  ) {}

  execute(
    command: DeleteXubioInvoiceCommand,
  ): Promise<DeleteXubioInvoiceResponse> {
    return this.deleteXubioInvoiceRepository.delete(command);
  }
}
