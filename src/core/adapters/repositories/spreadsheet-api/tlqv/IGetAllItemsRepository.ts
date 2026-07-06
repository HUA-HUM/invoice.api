import type {
  GetAllTlqvItemsCommand,
  GetAllTlqvItemsResponse,
} from '../../../../entities/spreadsheet-api/tlqv/TlqvItems';

export interface IGetAllItemsRepository {
  getAll(command?: GetAllTlqvItemsCommand): Promise<GetAllTlqvItemsResponse>;
}
