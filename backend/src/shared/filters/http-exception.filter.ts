import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Response } from 'express';
import { DomainException } from '../exceptions/domain.exception';

/**
 * Traduce cualquier DomainException (fondos insuficientes, cuenta destino
 * inexistente, etc. — ver modules/transactions/domain/exceptions) al código
 * HTTP que la propia excepción declara (422, 404, ...), en vez de que se
 * escape como un 500 genérico. Registrado globalmente en main.ts.
 */
@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(exception.httpStatus).json({
      statusCode: exception.httpStatus,
      error: exception.name,
      message: exception.message,
    });
  }
}
