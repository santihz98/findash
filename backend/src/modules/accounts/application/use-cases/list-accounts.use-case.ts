import { Inject, Injectable } from '@nestjs/common';
import { AccountStatus } from '@prisma/client';
import {
  ACCOUNT_REPOSITORY,
  IAccountRepository,
} from '../../domain/ports/account.repository.port';
import { AccountWithOwner } from '../../domain/entities/account.entity';

export interface ListAccountsCommand {
  page: number;
  limit: number;
  documentNumber?: string;
  status?: AccountStatus;
}

export interface ListAccountsResult {
  data: AccountWithOwner[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

@Injectable()
export class ListAccountsUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accountRepository: IAccountRepository,
  ) {}

  async execute(command: ListAccountsCommand): Promise<ListAccountsResult> {
    const { data, total } = await this.accountRepository.findManyWithOwner({
      page: command.page,
      limit: command.limit,
      documentNumber: command.documentNumber,
      status: command.status,
    });

    return {
      data,
      page: command.page,
      limit: command.limit,
      total,
      totalPages: Math.ceil(total / command.limit),
    };
  }
}
