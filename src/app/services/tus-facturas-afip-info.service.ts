import { Inject, Injectable } from '@nestjs/common';
import type {
  GetTusFacturasAfipInfoCommand,
  GetTusFacturasAfipInfoResponse,
} from '../../core/entities/tus-facturas/afip-info/TusFacturasAfipInfo';
import { GetTusFacturasAfipInfoInteractor } from '../../core/interactors/tus-facturas/GetTusFacturasAfipInfoInteractor';
import { GET_TUS_FACTURAS_AFIP_INFO_INTERACTOR } from '../modules/tus-facturas/tus-facturas.providers';

@Injectable()
export class TusFacturasAfipInfoService {
  constructor(
    @Inject(GET_TUS_FACTURAS_AFIP_INFO_INTERACTOR)
    private readonly interactor: GetTusFacturasAfipInfoInteractor,
  ) {}

  execute(
    command: GetTusFacturasAfipInfoCommand,
  ): Promise<GetTusFacturasAfipInfoResponse> {
    return this.interactor.execute(command);
  }
}
