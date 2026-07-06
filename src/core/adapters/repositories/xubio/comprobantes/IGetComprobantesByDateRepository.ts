import type {
  GetXubioComprobantesByDateCommand,
  GetXubioComprobantesByDateResponse,
} from '../../../../entities/xubio/comprobantes/XubioComprobante';

export interface IGetComprobantesByDateRepository {
  getByDateRange(
    command: GetXubioComprobantesByDateCommand,
  ): Promise<GetXubioComprobantesByDateResponse>;
}
