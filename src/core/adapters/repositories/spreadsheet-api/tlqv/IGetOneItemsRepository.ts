import type {
  GetOneTlqvItemsCommand,
  GetOneTlqvItemsResponse,
} from '../../../../entities/spreadsheet-api/tlqv/TlqvItems';

export interface IGetOneItemsRepository {
  getOne(command: GetOneTlqvItemsCommand): Promise<GetOneTlqvItemsResponse>;
}
