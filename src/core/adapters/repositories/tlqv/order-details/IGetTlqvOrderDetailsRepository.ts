import type {
  GetTlqvOrderDetailsCommand,
  GetTlqvOrderDetailsResponse,
} from '../../../../entities/tlqv/order-details/TlqvOrderDetails';

export interface IGetTlqvOrderDetailsRepository {
  getByTlqvCode(
    command: GetTlqvOrderDetailsCommand,
  ): Promise<GetTlqvOrderDetailsResponse>;
}
