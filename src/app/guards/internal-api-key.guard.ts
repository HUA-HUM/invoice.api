import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';

const INTERNAL_API_KEY_HEADER = 'x-internal-api-key';

@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expectedApiKey = this.configService
      .get<string>('INVOICE_INTERNAL_API_KEY')
      ?.trim();

    if (expectedApiKey === undefined || expectedApiKey === '') {
      throw new UnauthorizedException(
        'INVOICE_INTERNAL_API_KEY environment variable is required',
      );
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const receivedApiKey = readHeader(request.headers, INTERNAL_API_KEY_HEADER);

    if (
      receivedApiKey === undefined ||
      !safeCompare(receivedApiKey, expectedApiKey)
    ) {
      throw new UnauthorizedException('Invalid internal API key');
    }

    return true;
  }
}

function readHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
