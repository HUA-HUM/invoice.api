import type {
  FindXubioClienteByNameCommand,
  FindXubioClienteResponse,
} from '../../../../entities/xubio/clientes/XubioCliente';

export interface IFindXubioClienteRepository {
  findByName(
    command: FindXubioClienteByNameCommand,
  ): Promise<FindXubioClienteResponse>;

  /**
   * Lists every cliente. Xubio's clienteBean endpoint only filters by exact
   * name, so a cliente whose stored name differs from the one the order
   * carries (extra middle name, different spelling) is unreachable through
   * findByName. Listing lets us match on name tokens instead. The listing is
   * minimal — id and name only — so the caller still needs findByName to read
   * the full bean before trusting a match.
   *
   * Optional so existing repository doubles keep compiling; callers must
   * degrade gracefully when it is absent.
   */
  listAll?(): Promise<FindXubioClienteResponse>;
}
