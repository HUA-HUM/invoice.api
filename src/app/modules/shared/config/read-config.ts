import { ConfigService } from '@nestjs/config';

export function readRequiredConfig(
  configService: ConfigService,
  name: string,
): string {
  const value = configService.get<string>(name);
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} environment variable is required`);
  }
  return value.trim();
}

export function readOptionalConfig(
  configService: ConfigService,
  name: string,
): string | undefined {
  const value = configService.get<string>(name);
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  return value.trim();
}

export function readNumberConfig(
  configService: ConfigService,
  name: string,
  defaultValue: number,
): number {
  const value = configService.get<string>(name);
  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }

  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsedValue;
}
