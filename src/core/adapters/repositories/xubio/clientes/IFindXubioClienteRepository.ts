import type {
  FindXubioClienteByNameCommand,
  FindXubioClienteResponse,
} from '../../../../entities/xubio/clientes/XubioCliente';

export interface IFindXubioClienteRepository {
  findByName(
    command: FindXubioClienteByNameCommand,
  ): Promise<FindXubioClienteResponse>;
}
