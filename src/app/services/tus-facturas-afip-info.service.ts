import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MadreInvoiceClientIssuesRepository } from '../../core/driver/madre-api/invoice/client-issues/MadreInvoiceClientIssuesRepository';
import { GetTusFacturasAfipInfoRepository } from '../../core/driver/tus-facturas/afip-info/GetTusFacturasAfipInfoRepository';
import type {
  GetTusFacturasAfipInfoCommand,
  GetTusFacturasAfipInfoResponse,
} from '../../core/entities/tus-facturas/afip-info/TusFacturasAfipInfo';
import { GetTusFacturasAfipInfoInteractor } from '../../core/interactors/tus-facturas/GetTusFacturasAfipInfoInteractor';

@Injectable()
export class TusFacturasAfipInfoService {
  constructor(private readonly configService: ConfigService) {}

  execute(
    command: GetTusFacturasAfipInfoCommand,
  ): Promise<GetTusFacturasAfipInfoResponse> {
    return this.createInteractor().execute(command);
  }

  private createInteractor(): GetTusFacturasAfipInfoInteractor {
    const repository = new GetTusFacturasAfipInfoRepository({
      baseUrl: this.readOptionalConfig('TUS_FACTURAS_BASE_URL'),
      userToken: this.readRequiredConfig('TUS_FACTURAS_USER_TOKEN'),
      apiKey: this.readRequiredConfig('TUS_FACTURAS_API_KEY'),
      apiToken: this.readRequiredConfig('TUS_FACTURAS_API_TOKEN'),
      cookie: this.readOptionalConfig('TUS_FACTURAS_COOKIE'),
    });
    const issueRepository = new MadreInvoiceClientIssuesRepository({
      baseUrl: this.readRequiredConfig('MADRE_API_BASE_URL'),
      internalApiKey: this.readRequiredConfig('MADRE_INTERNAL_API_KEY'),
      timeoutInMilliseconds: this.readNumberConfig(
        'MADRE_API_TIMEOUT_MS',
        20_000,
      ),
    });

    return new GetTusFacturasAfipInfoInteractor(repository, issueRepository);
  }

  private readRequiredConfig(name: string): string {
    const value = this.configService.get<string>(name);
    if (value === undefined || value.trim() === '') {
      throw new Error(`${name} environment variable is required`);
    }
    return value.trim();
  }

  private readOptionalConfig(name: string): string | undefined {
    const value = this.configService.get<string>(name);
    if (value === undefined || value.trim() === '') {
      return undefined;
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
