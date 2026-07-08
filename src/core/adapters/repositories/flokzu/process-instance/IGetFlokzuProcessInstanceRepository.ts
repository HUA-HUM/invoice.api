import type {
  GetFlokzuProcessInstanceCommand,
  GetFlokzuProcessInstanceResponse,
} from '../../../../entities/flokzu/process-instance/FlokzuProcessInstance';

export interface IGetFlokzuProcessInstanceRepository {
  getByIdentifier(
    command: GetFlokzuProcessInstanceCommand,
  ): Promise<GetFlokzuProcessInstanceResponse>;
}
