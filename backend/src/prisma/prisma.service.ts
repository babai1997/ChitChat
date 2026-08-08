import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// How often to ping the database when idle, and how many connections to
// ping CONCURRENTLY each cycle. Both numbers are measured, not guessed:
//   - On this Neon (serverless Postgres) instance, a connection idle for as
//     little as ~20s already costs several extra seconds on its next query
//     (the compute/pooler recycles idle backend connections aggressively) —
//     a 20s keep-alive interval was measurably NOT frequent enough; 5s
//     reliably kept a connection at the genuine ~230ms network round-trip
//     baseline to us-east-1.
//   - A SINGLE keep-alive query only guarantees ONE connection in Prisma's
//     pool stays warm. Prisma's default pool size is `numCpus * 2 + 1` —
//     21 connections on this machine — so pinging just a handful left most
//     of the pool cold; a real request (which itself runs several queries
//     concurrently, e.g. messages.service.ts's create()) kept landing on
//     one of those. DATABASE_URL now pins connection_limit to a known,
//     smaller number (10 — comfortably above this app's real per-request
//     concurrency, per measurement) specifically so this constant can
//     match it exactly and warm the WHOLE pool every cycle. (Going the
//     other direction, connection_limit=1, was also tried and measured
//     WORSE — it forces legitimately-concurrent queries to serialize onto
//     one connection, ~3x the latency of running them in parallel.)
const KEEPALIVE_INTERVAL_MS = 5_000;
const KEEPALIVE_CONCURRENT_PINGS = 10; // must match DATABASE_URL's connection_limit

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private keepAliveTimer?: NodeJS.Timeout;

  async onModuleInit() {
    await this.$connect();

    this.keepAliveTimer = setInterval(() => {
      Promise.all(
        Array.from(
          { length: KEEPALIVE_CONCURRENT_PINGS },
          () => this.$queryRaw`SELECT 1`,
        ),
      ).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Keep-alive ping failed: ${message}`);
      });
    }, KEEPALIVE_INTERVAL_MS);
    this.keepAliveTimer.unref(); // never keep the process alive on its own
  }

  async onModuleDestroy() {
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    await this.$disconnect();
  }
}
