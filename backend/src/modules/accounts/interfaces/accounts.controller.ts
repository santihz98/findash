import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ListAccountsUseCase } from '../application/use-cases/list-accounts.use-case';
import { GetMyAccountsUseCase } from '../application/use-cases/get-my-accounts.use-case';
import { LookupAccountByNumberUseCase } from '../application/use-cases/lookup-account-by-number.use-case';
import { ListAccountsQueryDto } from './dto/list-accounts-query.dto';
import { LookupAccountQueryDto } from './dto/lookup-account-query.dto';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { AccessTokenPayload } from '../../auth/application/services/token.service';

// Controlador "tonto" (RN-04): dto -> command -> use case -> response.
@ApiTags('accounts')
@ApiBearerAuth('access-token')
@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly listAccountsUseCase: ListAccountsUseCase,
    private readonly getMyAccountsUseCase: GetMyAccountsUseCase,
    private readonly lookupAccountByNumberUseCase: LookupAccountByNumberUseCase,
  ) {}

  // RF-03. Orden de guards importa: JwtAuthGuard puebla request.user antes
  // de que RolesGuard lo lea.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get()
  @ApiOperation({ summary: 'Lista cuentas paginado, filtrable por documento del titular y/o status (solo ADMIN)' })
  @ApiResponse({
    status: 200,
    description: 'Página de resultados (posiblemente vacía si no hay coincidencias).',
    schema: {
      example: {
        data: [
          {
            id: '57d1b569-5127-44d7-b464-2e6a2a2ef17b',
            accountNumber: '1000000001',
            balance: '898.00',
            accountType: 'BASIC',
            status: 'ACTIVE',
            avatarUrl: null,
            documentNumber: '1010000002',
            email: 'basic@findash.dev',
          },
        ],
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'page < 1, limit > 100, o status con un valor fuera del enum.' })
  @ApiResponse({ status: 401, description: 'Token ausente, inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Autenticado pero no es ADMIN.' })
  list(@Query() query: ListAccountsQueryDto) {
    return this.listAccountsUseCase.execute(query);
  }

  // Cualquier rol autenticado — sin @Roles(), el userId sale del JWT
  // (nunca de un param/query del request), así que no hay forma de pedir
  // la cuenta de otro usuario por acá.
  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiOperation({ summary: 'Cuenta(s) del usuario autenticado (cualquier rol)' })
  @ApiResponse({
    status: 200,
    description: 'Siempre las propias — nunca las de otro usuario.',
    schema: {
      example: [
        {
          id: '57d1b569-5127-44d7-b464-2e6a2a2ef17b',
          accountNumber: '1000000001',
          balance: '898.00',
          accountType: 'BASIC',
          status: 'ACTIVE',
          avatarUrl: null,
        },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'Token ausente, inválido o expirado.' })
  me(@CurrentUser() user: AccessTokenPayload) {
    return this.getMyAccountsUseCase.execute(user.sub);
  }

  // Cualquier rol autenticado, sin @Roles() — un CLIENT necesita poder
  // resolver el accountNumber de UN TERCERO (destino de una transferencia)
  // tanto como un ADMIN, así que el guard no discrimina por rol; lo que
  // acota el alcance es la forma de la respuesta, no quién puede llamarlo.
  // Es una búsqueda de resolución (accountNumber -> id), no un endpoint de
  // consulta de datos: nunca devuelve balance, documentNumber, email ni
  // status, a propósito.
  @UseGuards(JwtAuthGuard)
  @Get('lookup')
  @ApiOperation({
    summary:
      'Resuelve un accountNumber (visible en pantalla) a su id (UUID) — paso previo para completar destAccountId en POST /transactions/transfer. Cualquier rol autenticado; jamás expone balance/documentNumber/email de terceros.',
  })
  @ApiResponse({
    status: 200,
    description: 'Solo id, accountNumber y accountType — nada de balance ni datos del titular.',
    schema: {
      example: {
        id: '57d1b569-5127-44d7-b464-2e6a2a2ef17b',
        accountNumber: '1000000003',
        accountType: 'PREMIUM',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'accountNumber ausente o vacío.' })
  @ApiResponse({ status: 401, description: 'Token ausente, inválido o expirado.' })
  @ApiResponse({ status: 404, description: 'No existe ninguna cuenta con ese accountNumber.' })
  lookup(@Query() query: LookupAccountQueryDto) {
    return this.lookupAccountByNumberUseCase.execute(query.accountNumber);
  }
}
