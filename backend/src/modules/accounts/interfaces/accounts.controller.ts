import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ListAccountsUseCase } from '../application/use-cases/list-accounts.use-case';
import { GetMyAccountsUseCase } from '../application/use-cases/get-my-accounts.use-case';
import { ListAccountsQueryDto } from './dto/list-accounts-query.dto';
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
}
