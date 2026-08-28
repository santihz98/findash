import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Role } from '@prisma/client';
import { CreateTransferUseCase } from '../application/use-cases/create-transfer.use-case';
import { ListMyTransactionsUseCase } from '../application/use-cases/list-my-transactions.use-case';
import { ListTransactionsUseCase } from '../application/use-cases/list-transactions.use-case';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { ListMyTransactionsQueryDto } from './dto/list-my-transactions-query.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { AccessTokenPayload } from '../../auth/application/services/token.service';
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor';

// Controlador "tonto" (RN-04): dto -> command -> use case -> response.
@ApiTags('transactions')
@ApiBearerAuth('access-token')
@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly createTransferUseCase: CreateTransferUseCase,
    private readonly listMyTransactionsUseCase: ListMyTransactionsUseCase,
    private readonly listTransactionsUseCase: ListTransactionsUseCase,
  ) {}

  // Solo CLIENT (explícito, no solo "porque un ADMIN no tiene cuenta"): un
  // ADMIN no debería poder transferir aunque llegara a tener una cuenta.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLIENT)
  @UseInterceptors(IdempotencyInterceptor)
  @Post('transfer')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Transfiere dinero desde la cuenta del usuario autenticado a otra cuenta (solo CLIENT)',
    description:
      'La comisión se calcula por el tipo de cuenta ORIGEN (RN-03: BASIC 2%, PREMIUM 0%, CORPORATE $5 fijo) — quien envía paga, no quien recibe. RN-02: antes de mover el dinero, consulta un servicio anti-fraude simulado (demora 1-10s) con un timeout de 3s — si no responde a tiempo, aborta con 504. RNF-01: ambas cuentas se bloquean con SELECT FOR UPDATE en orden determinístico. RN-01: requiere X-Idempotency-Key — reenviar la misma request con la misma key devuelve la transferencia original en vez de duplicarla.',
  })
  @ApiHeader({
    name: 'X-Idempotency-Key',
    required: true,
    description:
      'Identificador único por intento de transferencia (ej. un UUID generado por el cliente). Reenviar la misma key devuelve la transferencia original ya creada — nunca se ejecuta dos veces. Requerido: sin este header, 400.',
    example: '3f29a1c4-2b7e-4b0a-9f3e-7a6d1e8c0b2a',
  })
  @ApiResponse({
    status: 201,
    description: 'Transferencia completada — ambos balances ya quedaron actualizados en la base.',
    schema: {
      example: {
        id: '0b89721a-1370-4f69-b201-7427efe1125c',
        originAccountId: '57d1b569-5127-44d7-b464-2e6a2a2ef17b',
        destAccountId: '558944c9-2eaf-431d-b6e0-a3d9b59c2001',
        amount: '100.00',
        commission: '2.00',
        authorizationCode: '36211CC2A6FD',
        status: 'COMPLETED',
        createdAt: '2026-08-27T16:05:41.540Z',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'amount inválido (cero, negativo, más de 2 decimales, o no numérico), destAccountId vacío, o falta el header X-Idempotency-Key.',
  })
  @ApiResponse({ status: 401, description: 'Token ausente, inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Autenticado pero no es CLIENT (ej. un ADMIN).' })
  @ApiResponse({
    status: 404,
    description: 'La cuenta destino no existe.',
    schema: {
      example: {
        statusCode: 404,
        error: 'DestinationAccountNotFoundException',
        message: 'La cuenta destino "..." no existe',
      },
    },
  })
  @ApiResponse({
    status: 409,
    description:
      'Ya hay una transferencia en curso con esta misma X-Idempotency-Key y no terminó a tiempo (RN-01) — reintentar.',
  })
  @ApiResponse({
    status: 422,
    description:
      'Fondos insuficientes, origen igual a destino, o el usuario autenticado no tiene exactamente una cuenta propia.',
    schema: {
      example: {
        statusCode: 422,
        error: 'InsufficientFundsException',
        message: 'Fondos insuficientes para completar la transferencia',
      },
    },
  })
  @ApiResponse({
    status: 504,
    description:
      'El servicio anti-fraude (simulado, RN-02) no respondió dentro de 3s — falla transitoria, reintentar puede funcionar (a diferencia del 422, que implica que el mismo request siempre va a fallar).',
    schema: {
      example: {
        statusCode: 504,
        error: 'AntiFraudTimeoutException',
        message: 'El servicio anti-fraude no respondió a tiempo. Intenta nuevamente.',
      },
    },
  })
  transfer(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateTransferDto, @Req() request: Request) {
    // @Req() en vez de @Headers('x-idempotency-key'): ese decorator hace
    // que @nestjs/swagger auto-genere un segundo parámetro de header sin
    // descripción/ejemplo, duplicado con el @ApiHeader() de arriba (mismo
    // header, dos entradas en /api/docs — confuso en la UI). El header ya
    // es requerido por IdempotencyInterceptor antes de llegar acá, así que
    // no hace falta revalidarlo.
    const idempotencyKey = request.headers['x-idempotency-key'] as string;

    return this.createTransferUseCase.execute({
      userId: user.sub,
      destAccountId: dto.destAccountId,
      amount: dto.amount,
      idempotencyKey,
    });
  }

  // RF-02 (Sesión 17) — historial de movimientos, solo CLIENT. El userId
  // sale del JWT (nunca de un param/query), mismo criterio que
  // GET /accounts/me — estructuralmente no existe forma de pedir el
  // historial de otro usuario por acá.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLIENT)
  @Get('me')
  @ApiOperation({
    summary: 'Historial de movimientos de la cuenta del usuario autenticado, paginado (solo CLIENT)',
    description:
      'Incluye transacciones enviadas Y recibidas (campo `direction`: "SENT"/"RECEIVED", relativo a la cuenta consultada) — no solo las que el usuario originó. Incluye también intentos fallidos/rechazados (`status`: REJECTED/FAILED), no solo COMPLETED, para que el usuario vea igualmente sus intentos sin éxito.',
  })
  @ApiResponse({
    status: 200,
    description: 'Página de resultados (posiblemente vacía).',
    schema: {
      example: {
        data: [
          {
            id: '0b89721a-1370-4f69-b201-7427efe1125c',
            originAccountId: '57d1b569-5127-44d7-b464-2e6a2a2ef17b',
            destAccountId: '558944c9-2eaf-431d-b6e0-a3d9b59c2001',
            amount: '100.00',
            commission: '2.00',
            authorizationCode: '36211CC2A6FD',
            status: 'COMPLETED',
            createdAt: '2026-08-27T16:05:41.540Z',
            direction: 'SENT',
          },
        ],
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'page < 1 o limit > 100.' })
  @ApiResponse({ status: 401, description: 'Token ausente, inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Autenticado pero no es CLIENT.' })
  @ApiResponse({
    status: 422,
    description: 'El usuario autenticado no tiene exactamente una cuenta propia (ver NoOriginAccountException).',
  })
  me(@CurrentUser() user: AccessTokenPayload, @Query() query: ListMyTransactionsQueryDto) {
    return this.listMyTransactionsUseCase.execute({
      userId: user.sub,
      page: query.page,
      limit: query.limit,
    });
  }

  // RF-02 (Sesión 17) — "auditar transacciones", solo ADMIN. TODAS las
  // transacciones de la plataforma, sin scope de cuenta.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get()
  @ApiOperation({
    summary: 'Lista TODAS las transacciones de la plataforma, paginado, filtrable por status y/o rango de fechas (solo ADMIN)',
    description:
      'A diferencia de GET /transactions/me, no está scopeado a ninguna cuenta — es la vista de auditoría. `dateFrom`/`dateTo` filtran sobre `createdAt` y son combinables entre sí y con `status`.',
  })
  @ApiResponse({
    status: 200,
    description: 'Página de resultados (posiblemente vacía).',
    schema: {
      example: {
        data: [
          {
            id: '0b89721a-1370-4f69-b201-7427efe1125c',
            originAccountId: '57d1b569-5127-44d7-b464-2e6a2a2ef17b',
            destAccountId: '558944c9-2eaf-431d-b6e0-a3d9b59c2001',
            amount: '100.00',
            commission: '2.00',
            authorizationCode: '36211CC2A6FD',
            status: 'COMPLETED',
            createdAt: '2026-08-27T16:05:41.540Z',
          },
        ],
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'page < 1, limit > 100, status fuera del enum, o dateFrom/dateTo no son ISO 8601 válidos.' })
  @ApiResponse({ status: 401, description: 'Token ausente, inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Autenticado pero no es ADMIN.' })
  list(@Query() query: ListTransactionsQueryDto) {
    return this.listTransactionsUseCase.execute({
      page: query.page,
      limit: query.limit,
      status: query.status,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
    });
  }
}
