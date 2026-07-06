import type {
  GetXubioComprobanteDetailCommand,
  GetXubioComprobanteDetailResponse,
} from '../../../../entities/xubio/comprobantes/XubioComprobante';

export interface IGetComprobanteDetailRepository {
  getDetail(
    command: GetXubioComprobanteDetailCommand,
  ): Promise<GetXubioComprobanteDetailResponse>;
}
