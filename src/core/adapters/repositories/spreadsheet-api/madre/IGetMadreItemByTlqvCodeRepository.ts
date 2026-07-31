import type {
  GetMadreItemByTlqvCodeCommand,
  GetMadreItemByTlqvCodeResponse,
} from '../../../../entities/spreadsheet-api/madre/MadreItems';

export interface IGetMadreItemByTlqvCodeRepository {
  getByTlqvCode(
    command: GetMadreItemByTlqvCodeCommand,
  ): Promise<GetMadreItemByTlqvCodeResponse>;
}
