import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { IIdempotencyKeyRepository } from '../domain/ports/idempotency-key.repository.port';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

@Injectable()
export class PrismaIdempotencyKeyRepository implements IIdempotencyKeyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async claim(key: string): Promise<boolean> {
    try {
      await this.prisma.idempotencyKey.create({ data: { key } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
        return false;
      }
      throw error;
    }
  }

  async complete(key: string, transactionId: string): Promise<void> {
    await this.prisma.idempotencyKey.update({ where: { key }, data: { transactionId } });
  }

  async findTransactionId(key: string): Promise<string | null> {
    const record = await this.prisma.idempotencyKey.findUnique({ where: { key } });
    return record?.transactionId ?? null;
  }

  async release(key: string): Promise<void> {
    await this.prisma.idempotencyKey.deleteMany({ where: { key, transactionId: null } });
  }
}
