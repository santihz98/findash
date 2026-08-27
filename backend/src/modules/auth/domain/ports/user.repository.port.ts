import { AuthUser } from '../entities/auth-user.entity';

export interface IUserRepository {
  findByEmail(email: string): Promise<AuthUser | null>;
  findById(id: string): Promise<AuthUser | null>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
