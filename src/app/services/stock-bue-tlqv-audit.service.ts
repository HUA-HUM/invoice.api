import { Inject, Injectable } from '@nestjs/common';
import {
  FindUnbilledDispatchedStockBueTlqvInteractor,
  type FindUnbilledDispatchedStockBueTlqvCommand,
  type FindUnbilledDispatchedStockBueTlqvResponse,
} from '../../core/interactors/stock-bue/FindUnbilledDispatchedStockBueTlqvInteractor';
import { FIND_UNBILLED_DISPATCHED_STOCK_BUE_TLQV_INTERACTOR } from '../modules/stock-bue/stock-bue.providers';

@Injectable()
export class StockBueTlqvAuditService {
  constructor(
    @Inject(FIND_UNBILLED_DISPATCHED_STOCK_BUE_TLQV_INTERACTOR)
    private readonly interactor: FindUnbilledDispatchedStockBueTlqvInteractor,
  ) {}

  execute(
    command: FindUnbilledDispatchedStockBueTlqvCommand,
  ): Promise<FindUnbilledDispatchedStockBueTlqvResponse> {
    return this.interactor.execute(command);
  }
}
