import type {
  CreateXubioInvoiceCommand,
  CreateXubioInvoiceResponse,
} from '../../../../entities/xubio/facturas/XubioInvoice';

export interface ICreateXubioInvoiceRepository {
  create(
    command: CreateXubioInvoiceCommand,
  ): Promise<CreateXubioInvoiceResponse>;
}
