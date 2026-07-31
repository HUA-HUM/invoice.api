import type {
  DeleteXubioInvoiceCommand,
  DeleteXubioInvoiceResponse,
} from '../../../../entities/xubio/facturas/XubioInvoice';

export interface IDeleteXubioInvoiceRepository {
  delete(
    command: DeleteXubioInvoiceCommand,
  ): Promise<DeleteXubioInvoiceResponse>;
}
