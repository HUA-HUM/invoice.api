import type {
  GetTusFacturasAfipInfoCommand,
  GetTusFacturasAfipInfoResponse,
} from '../../../../entities/tus-facturas/afip-info/TusFacturasAfipInfo';

export interface IGetTusFacturasAfipInfoRepository {
  getAfipInfo(
    command: GetTusFacturasAfipInfoCommand,
  ): Promise<GetTusFacturasAfipInfoResponse>;
}
