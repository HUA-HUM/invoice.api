import type { IGetTlqvOrderDetailsRepository } from '../../../../adapters/repositories/tlqv/order-details/IGetTlqvOrderDetailsRepository';
import type {
  GetTlqvOrderDetailsCommand,
  GetTlqvOrderDetailsResponse,
} from '../../../../entities/tlqv/order-details/TlqvOrderDetails';
import type { GetFlokzuProcessInstanceRepositoryOptions } from '../process-instance/GetFlokzuProcessInstanceRepository';
import { GetFlokzuProcessInstanceRepository } from '../process-instance/GetFlokzuProcessInstanceRepository';

const SOURCE = 'flokzu';

export class GetFlokzuTlqvOrderDetailsRepository implements IGetTlqvOrderDetailsRepository {
  private readonly processInstanceRepository: GetFlokzuProcessInstanceRepository;

  constructor(options: GetFlokzuProcessInstanceRepositoryOptions = {}) {
    this.processInstanceRepository = new GetFlokzuProcessInstanceRepository(
      options,
    );
  }

  async getByTlqvCode(
    command: GetTlqvOrderDetailsCommand,
  ): Promise<GetTlqvOrderDetailsResponse> {
    const tlqvCode = normalizeTlqvCode(command.tlqvCode);
    const response = await this.processInstanceRepository.getByIdentifier({
      identifier: tlqvCode,
    });
    const processInstance = response.processInstance;

    return {
      found: true,
      orderDetails: {
        tlqvCode,
        source: SOURCE,
        buyerData: processInstance.buyerData,
        rawPayload: processInstance.rawPayload,
      },
    };
  }
}

function normalizeTlqvCode(value: string): string {
  const normalizedValue = value.trim().toUpperCase();
  if (normalizedValue === '') {
    throw new RangeError('tlqvCode is required');
  }

  return normalizedValue;
}
