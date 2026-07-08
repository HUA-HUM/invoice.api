import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GetInvoiceClientIssueByTlqvCodeResponse,
  InvoiceClientIssueReason,
  InvoiceClientIssueSnapshot,
} from '../../core/entities/invoice/client-issues/InvoiceClientIssue';
import { MadreInvoiceClientIssuesRepository } from '../../core/driver/madre-api/invoice/client-issues/MadreInvoiceClientIssuesRepository';

@Injectable()
export class TlqvInvoiceIssuesService {
  constructor(private readonly configService: ConfigService) {}

  getSnapshot(command: {
    reason?: InvoiceClientIssueReason;
    limit?: number;
  }): Promise<InvoiceClientIssueSnapshot> {
    return this.createRepository().getSnapshot(command);
  }

  getByTlqvCode(
    tlqvCode: string,
  ): Promise<GetInvoiceClientIssueByTlqvCodeResponse> {
    return this.createRepository().getByTlqvCode({ tlqvCode });
  }

  private createRepository(): MadreInvoiceClientIssuesRepository {
    return new MadreInvoiceClientIssuesRepository({
      baseUrl: this.readRequiredConfig('MADRE_API_BASE_URL'),
      internalApiKey: this.readRequiredConfig('MADRE_INTERNAL_API_KEY'),
      timeoutInMilliseconds: this.readNumberConfig(
        'MADRE_API_TIMEOUT_MS',
        20_000,
      ),
    });
  }

  private readRequiredConfig(name: string): string {
    const value = this.configService.get<string>(name);
    if (value === undefined || value.trim() === '') {
      throw new Error(`${name} environment variable is required`);
    }
    return value.trim();
  }

  private readNumberConfig(name: string, defaultValue: number): number {
    const value = this.configService.get<string>(name);
    if (value === undefined || value.trim() === '') {
      return defaultValue;
    }

    const parsedValue = Number(value);
    if (!Number.isInteger(parsedValue) || parsedValue < 1) {
      throw new Error(`${name} must be a positive integer`);
    }

    return parsedValue;
  }
}
