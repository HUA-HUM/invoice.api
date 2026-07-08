import type {
  CreateXubioClienteCommand,
  CreateXubioClienteResponse,
} from '../../../../entities/xubio/clientes/XubioCliente';

export interface ICreateXubioClienteRepository {
  create(
    command: CreateXubioClienteCommand,
  ): Promise<CreateXubioClienteResponse>;
}
