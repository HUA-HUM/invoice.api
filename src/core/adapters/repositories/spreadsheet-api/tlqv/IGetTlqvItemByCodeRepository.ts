import type {
  GetTlqvItemByCodeCommand,
  GetTlqvItemByCodeResponse,
} from '../../../../entities/spreadsheet-api/tlqv/TlqvItems';

export interface IGetTlqvItemByCodeRepository {
  getByCode(
    command: GetTlqvItemByCodeCommand,
  ): Promise<GetTlqvItemByCodeResponse>;
}
