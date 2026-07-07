import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker, type JobsOptions } from 'bullmq';
import type {
  RefreshStockBueTlqvCacheCommand,
  RefreshStockBueTlqvCacheResponse,
} from '../../core/interactors/stock-bue/RefreshStockBueTlqvCacheInteractor';
import { RedisConnectionOptionsFactory } from './redis/redis-connection-options.factory';
import { StockBueTlqvCacheRefreshService } from './stock-bue-tlqv-cache-refresh.service';

export const STOCK_BUE_TLQV_CACHE_REFRESH_QUEUE_NAME =
  'stock-bue-tlqv-cache-refresh';
const STOCK_BUE_TLQV_CACHE_REFRESH_JOB_NAME = 'refresh';
const STOCK_BUE_TLQV_CACHE_REFRESH_REPEAT_JOB_ID = 'stock-bue-tlqv-cache-cron';
const DEFAULT_REFRESH_CRON = '0 3,15 * * *';

interface StockBueTlqvCacheRefreshJobData {
  command: RefreshStockBueTlqvCacheCommand;
  source: 'manual' | 'cron';
}

export interface EnqueueStockBueTlqvCacheRefreshResponse {
  jobId: string;
  queueName: string;
  status: 'queued';
  source: 'manual';
  pageSize?: number;
}

@Injectable()
export class StockBueTlqvCacheRefreshQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(
    StockBueTlqvCacheRefreshQueueService.name,
  );
  private readonly queue: Queue<StockBueTlqvCacheRefreshJobData>;
  private readonly worker: Worker<
    StockBueTlqvCacheRefreshJobData,
    RefreshStockBueTlqvCacheResponse
  >;

  constructor(
    private readonly configService: ConfigService,
    private readonly refreshService: StockBueTlqvCacheRefreshService,
    private readonly redisConnectionOptionsFactory: RedisConnectionOptionsFactory,
  ) {
    const connection = this.redisConnectionOptionsFactory.build();

    this.queue = new Queue<StockBueTlqvCacheRefreshJobData>(
      STOCK_BUE_TLQV_CACHE_REFRESH_QUEUE_NAME,
      {
        connection,
        defaultJobOptions: this.buildDefaultJobOptions(),
      },
    );
    this.worker = new Worker<
      StockBueTlqvCacheRefreshJobData,
      RefreshStockBueTlqvCacheResponse
    >(
      STOCK_BUE_TLQV_CACHE_REFRESH_QUEUE_NAME,
      (job) => this.processRefreshJob(job),
      {
        connection,
        concurrency: this.readNumberConfig(
          'STOCK_BUE_TLQV_CACHE_QUEUE_CONCURRENCY',
          1,
        ),
      },
    );

    this.registerWorkerLogging();
    void this.registerCronJob();
  }

  getQueue(): Queue<StockBueTlqvCacheRefreshJobData> {
    return this.queue;
  }

  async enqueueManual(
    command: RefreshStockBueTlqvCacheCommand = {},
  ): Promise<EnqueueStockBueTlqvCacheRefreshResponse> {
    await this.queue.waitUntilReady();

    const job = await this.queue.add(STOCK_BUE_TLQV_CACHE_REFRESH_JOB_NAME, {
      command,
      source: 'manual',
    });

    return {
      jobId: String(job.id),
      queueName: STOCK_BUE_TLQV_CACHE_REFRESH_QUEUE_NAME,
      status: 'queued',
      source: 'manual',
      pageSize: command.pageSize,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }

  private async registerCronJob(): Promise<void> {
    if (!this.readBooleanConfig('STOCK_BUE_TLQV_CACHE_CRON_ENABLED', true)) {
      return;
    }

    await this.queue.waitUntilReady();
    await this.queue.add(
      STOCK_BUE_TLQV_CACHE_REFRESH_JOB_NAME,
      {
        command: {
          pageSize: this.readNumberConfig(
            'STOCK_BUE_TLQV_CACHE_PAGE_SIZE',
            100,
          ),
        },
        source: 'cron',
      },
      {
        jobId: STOCK_BUE_TLQV_CACHE_REFRESH_REPEAT_JOB_ID,
        repeat: {
          pattern:
            this.readOptionalConfig('STOCK_BUE_TLQV_CACHE_REFRESH_CRON') ??
            DEFAULT_REFRESH_CRON,
        },
      },
    );
  }

  private async processRefreshJob(
    job: Job<StockBueTlqvCacheRefreshJobData>,
  ): Promise<RefreshStockBueTlqvCacheResponse> {
    this.logger.log(
      `Stock BUE TLQV cache refresh started ${JSON.stringify({
        jobId: job.id,
        source: job.data.source,
        pageSize: job.data.command.pageSize,
      })}`,
    );

    return this.refreshService.execute(job.data.command);
  }

  private registerWorkerLogging(): void {
    this.worker.on('completed', (job, result) => {
      this.logger.log(
        `Stock BUE TLQV cache refresh completed ${JSON.stringify({
          jobId: job.id,
          source: job.data.source,
          totalSheetRows: result.totalSheetRows,
          totalUniqueTlqv: result.totalUniqueTlqv,
        })}`,
      );
    });
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Stock BUE TLQV cache refresh failed ${JSON.stringify({
          jobId: job?.id,
          source: job?.data.source,
          errorMessage: error.message,
        })}`,
      );
    });
    this.worker.on('error', (error) => {
      this.logger.error(
        `Stock BUE TLQV cache refresh worker error ${JSON.stringify({
          errorMessage: error.message,
        })}`,
      );
    });
  }

  private buildDefaultJobOptions(): JobsOptions {
    return {
      attempts: this.readNumberConfig('STOCK_BUE_TLQV_CACHE_QUEUE_ATTEMPTS', 3),
      backoff: {
        type: 'fixed',
        delay: this.readNumberConfig(
          'STOCK_BUE_TLQV_CACHE_QUEUE_RETRY_DELAY_MS',
          30_000,
        ),
      },
      removeOnComplete: {
        count: this.readNumberConfig(
          'STOCK_BUE_TLQV_CACHE_QUEUE_REMOVE_COMPLETE_COUNT',
          1_000,
        ),
      },
      removeOnFail: {
        count: this.readNumberConfig(
          'STOCK_BUE_TLQV_CACHE_QUEUE_REMOVE_FAIL_COUNT',
          1_000,
        ),
      },
    };
  }

  private readOptionalConfig(name: string): string | undefined {
    const value = this.configService.get<string>(name);
    if (value === undefined || value.trim() === '') {
      return undefined;
    }
    return value.trim();
  }

  private readNumberConfig(name: string, defaultValue: number): number {
    const rawValue = this.readOptionalConfig(name);
    if (rawValue === undefined) {
      return defaultValue;
    }

    const value = Number(rawValue);
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${name} must be a positive integer`);
    }

    return value;
  }

  private readBooleanConfig(name: string, defaultValue: boolean): boolean {
    const rawValue = this.readOptionalConfig(name);
    if (rawValue === undefined) {
      return defaultValue;
    }

    return ['1', 'true', 'yes', 'y'].includes(rawValue.toLowerCase());
  }
}
