import { Inject, Injectable } from '@nestjs/common';
import { Prisma, TransactionStatus } from '@prisma/client';
import {
  ACCOUNT_REPOSITORY,
  IAccountRepository,
} from '../../../accounts/domain/ports/account.repository.port';
import {
  ITransactionRepository,
  TRANSACTION_REPOSITORY,
} from '../../domain/ports/transaction.repository.port';
import {
  ANTI_FRAUD_SERVICE,
  ANTI_FRAUD_TIMEOUT_MS,
  IAntiFraudService,
} from '../../domain/ports/anti-fraud.service.port';
import { CommissionStrategyFactory } from '../../domain/factories/commission-strategy.factory';
import { AuthorizationCodeGeneratorService } from '../services/authorization-code-generator.service';
import { InsufficientFundsException } from '../../domain/exceptions/insufficient-funds.exception';
import { DestinationAccountNotFoundException } from '../../domain/exceptions/destination-account-not-found.exception';
import { SameAccountTransferException } from '../../domain/exceptions/same-account-transfer.exception';
import { NoOriginAccountException } from '../../domain/exceptions/no-origin-account.exception';
import { AntiFraudTimeoutException } from '../../domain/exceptions/anti-fraud-timeout.exception';
import { Transaction } from '../../domain/entities/transaction.entity';
import { DomainException } from '../../../../shared/exceptions/domain.exception';

export interface CreateTransferCommand {
  /** userId del JWT — nunca un accountId libre del body (RN-04). */
  userId: string;
  destAccountId: string;
  /** String ya validado como decimal positivo por el DTO
   * (IsPositiveDecimalString) — se parsea a Decimal acá, nunca a `number`. */
  amount: string;
  /** RN-01 — la key real de `X-Idempotency-Key`, ya reclamada por
   * `IdempotencyInterceptor` antes de invocar el use case (Sesión 5). El
   * use case no valida su formato ni su unicidad — eso ya lo garantizó el
   * interceptor; acá solo se usa para persistirla en la Transaction, y
   * solo si la transferencia termina COMPLETED (Sesión 6.5, ver abajo). */
  idempotencyKey: string;
}

/**
 * Resultado interno del callback de `runInTransaction` (Sesión 6.5, RF-07).
 * Nunca se lanza una excepción de dominio DIRECTAMENTE dentro de ese
 * callback para los casos REJECTED que ya alcanzaron a persistir su fila de
 * auditoría (fondos insuficientes, destino inexistente): lanzar ahí haría
 * que Prisma revierta TODA la transacción, incluida la fila que se acaba de
 * insertar. Como en esos dos casos no hubo ningún `updateBalance` que
 * revertir (la validación ocurre antes de cualquier UPDATE), es seguro —y
 * es justamente el objetivo de esta sesión— dejar que la transacción haga
 * commit con solo la fila de auditoría adentro, y recién relanzar la
 * excepción original AFUERA, una vez que ese commit ya pasó. El código HTTP
 * que ve el cliente no cambia (`execute` relanza el mismo `DomainException`
 * de siempre) — lo único distinto es qué queda persistido.
 */
type TransferOutcome = { ok: true; transaction: Transaction } | { ok: false; error: DomainException };

/**
 * RN-04 — orquestador puro (ARCHITECTURE.md 3.2). El controlador solo hace
 * dto -> command -> execute() -> response; toda la orquestación vive acá:
 * resolver la cuenta origen, validar, calcular comisión (Strategy+Factory,
 * RN-03), generar el código de autorización, y persistir todo en una única
 * transacción de Prisma.
 *
 * RNF-01 (Sesión 5): ambas cuentas se bloquean con `SELECT ... FOR UPDATE`
 * (`findByIdForUpdate`), siempre en el mismo orden determinístico por id —
 * ver el bloque dentro de `runInTransaction` para el detalle.
 *
 * RN-02 (Sesión 6): antes de tomar cualquier lock, se consulta el servicio
 * anti-fraude (simulado) con un timeout de `ANTI_FRAUD_TIMEOUT_MS` — no
 * tiene sentido bloquear filas de cuentas mientras se espera una llamada
 * externa que puede tardar hasta 10s.
 *
 * RF-07 (Sesión 6.5): toda excepción de dominio que aborta una transferencia
 * (salvo `NoOriginAccountException`, ver más abajo) ahora persiste una fila
 * `Transaction` de auditoría con `status` REJECTED o FAILED ANTES de
 * relanzar la excepción — sin esto, el dashboard de la Sesión 7 nunca
 * tendría datos reales de transferencias fallidas/rechazadas que contar.
 * Clasificación completa (documentada también en PROGRESS.md Sesión 6.5):
 *
 *  - REJECTED — regla de negocio violada, con la cuenta origen ya resuelta:
 *    `SameAccountTransferException`, `DestinationAccountNotFoundException`,
 *    `InsufficientFundsException`.
 *  - FAILED — falla técnica/externa, no una regla de negocio:
 *    `AntiFraudTimeoutException`.
 *  - NO PERSISTIBLE — `NoOriginAccountException`: no hay ninguna cuenta
 *    origen real a la cual atar la fila (0 cuentas del usuario, o >1 sin
 *    forma de desambiguar). También no-persistibles, pero por no llegar
 *    nunca a este use case: los 400 de validación del DTO y los 403 de
 *    RolesGuard — ocurren antes de que el controller invoque `execute()`.
 */
@Injectable()
export class CreateTransferUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accountRepository: IAccountRepository,
    @Inject(TRANSACTION_REPOSITORY) private readonly transactionRepository: ITransactionRepository,
    @Inject(ANTI_FRAUD_SERVICE) private readonly antiFraudService: IAntiFraudService,
    private readonly authCodeGenerator: AuthorizationCodeGeneratorService,
  ) {}

  async execute(command: CreateTransferCommand): Promise<Transaction> {
    // RN-04: el origen sale del usuario autenticado, nunca de un id libre
    // del body. Con el modelo actual (User 1:N Account) esto asume que el
    // CLIENT tiene exactamente una cuenta — ver NoOriginAccountException
    // para la justificación completa de por qué no se "adivina" cuál usar
    // si hay más de una.
    const ownedAccounts = await this.accountRepository.findManyByUserId(command.userId);
    if (ownedAccounts.length !== 1) {
      // NO PERSISTIBLE (Sesión 6.5): sin una cuenta origen real, no hay
      // ningún id válido para el FK `originAccountId` (NOT NULL, a
      // diferencia de `destAccountId`) — no hay fila de auditoría posible.
      throw new NoOriginAccountException();
    }
    const originAccountId = ownedAccounts[0].id;
    const amount = new Prisma.Decimal(command.amount);

    if (originAccountId === command.destAccountId) {
      // REJECTED (Sesión 6.5): ocurre antes de checkAntiFraud/
      // runInTransaction, así que es un INSERT suelto (sin `trx` — ver
      // ITransactionRepository.create). destAccountId = originAccountId es
      // seguro de persistir tal cual: es la MISMA cuenta que ya se
      // confirmó real dos líneas arriba, no un id sin verificar.
      await this.persistFailedAttempt({
        status: TransactionStatus.REJECTED,
        originAccountId,
        destAccountId: originAccountId,
        amount,
        commission: null, // no se llegó a resolver la Strategy (RN-03)
      });
      throw new SameAccountTransferException();
    }

    // RN-02: se corre ANTES de abrir la transacción de Prisma / tomar
    // locks — validaciones baratas primero (arriba), llamada externa cara
    // después, y recién ahí lo que necesita locks.
    try {
      await this.checkAntiFraud({
        originAccountId,
        destAccountId: command.destAccountId,
        amount: command.amount,
      });
    } catch (error) {
      if (error instanceof AntiFraudTimeoutException) {
        // FAILED (Sesión 6.5): falla técnica/externa, no una regla de
        // negocio. destAccountId = NULL a propósito, NUNCA
        // command.destAccountId tal cual: a esta altura todavía no se
        // confirmó contra la base que esa cuenta exista (eso pasa recién
        // dentro de runInTransaction, más abajo) — el FK de la columna
        // rechazaría el INSERT si el id fuera inválido/inexistente. Mismo
        // motivo por el que commission queda NULL: la Strategy (RN-03)
        // depende del destino, que tampoco se confirmó todavía.
        await this.persistFailedAttempt({
          status: TransactionStatus.FAILED,
          originAccountId,
          destAccountId: null,
          amount,
          commission: null,
        });
      }
      throw error;
    }

    const outcome = await this.transactionRepository.runInTransaction<TransferOutcome>(async (trx) => {
      // RNF-01: bloquear SIEMPRE en el mismo orden (id ascendente), sin
      // importar cuál id es origen y cuál es destino. Esto es lo único que
      // evita el deadlock cuando dos transferencias cruzadas compiten al
      // mismo tiempo (A->B y B->A): si cada una bloqueara "origen primero,
      // destino después", la transferencia A->B tomaría el lock de A y
      // esperaría el de B, mientras B->A toma el lock de B y espera el de
      // A — las dos esperando para siempre (deadlock clásico). Ordenando
      // por id antes de bloquear, ambas transacciones piden los locks en
      // el mismo orden — la segunda simplemente espera a que la primera
      // termine, nunca hay una espera circular. Ver el test de deadlock
      // cruzado (create-transfer-concurrency.integration.spec.ts) que
      // colgaría/haría timeout si este orden estuviera mal.
      const [firstId, secondId] = [originAccountId, command.destAccountId].sort();
      const firstAccount = await this.accountRepository.findByIdForUpdate(firstId, trx);
      const secondAccount = await this.accountRepository.findByIdForUpdate(secondId, trx);

      const origin = firstId === originAccountId ? firstAccount : secondAccount;
      const dest = firstId === originAccountId ? secondAccount : firstAccount;

      // `origin` siempre existe acá (viene de findManyByUserId arriba) —
      // este chequeo es por seguridad de tipos, no un caso de negocio real
      // (por eso, a diferencia de los de abajo, no persiste nada: nunca se
      // ejercita en la práctica).
      if (!origin) {
        throw new NoOriginAccountException();
      }
      if (!dest) {
        // REJECTED (Sesión 6.5): origen confirmado, destino confirmado
        // INEXISTENTE — destAccountId se persiste NULL (nunca el id crudo
        // del request: apuntaría a una fila que no existe, el FK lo
        // rechazaría). Se persiste DENTRO de la misma transacción de
        // Prisma (mismo `trx`, tarea 5 de PROGRESS.md Sesión 6.5) pero sin
        // abortarla — devolviendo un resultado en vez de lanzar acá, la
        // transacción sigue su curso normal y hace commit solo de esta
        // fila de auditoría: no hubo ningún `updateBalance` que revertir
        // todavía, así que no hay ningún riesgo de dejar un balance a
        // medias.
        await this.transactionRepository.create(
          {
            originAccountId: origin.id,
            destAccountId: null,
            amount,
            commission: null, // Strategy nunca se resolvió (depende del destino confirmado)
            authorizationCode: null,
            idempotencyKey: null,
            status: TransactionStatus.REJECTED,
          },
          trx,
        );
        return { ok: false, error: new DestinationAccountNotFoundException(command.destAccountId) };
      }

      // RN-03: quien envía paga la comisión — la strategy se resuelve por
      // el accountType del origen, nunca del destino.
      const strategy = CommissionStrategyFactory.create(origin.accountType);
      const commission = strategy.calculate(amount);
      const totalDebit = amount.plus(commission);

      const originBalance = new Prisma.Decimal(origin.balance);
      if (originBalance.lessThan(totalDebit)) {
        // REJECTED (Sesión 6.5): origen y destino confirmados, comisión ya
        // calculada (es lo único de más que hay disponible acá vs. el caso
        // de arriba) — authorizationCode/idempotencyKey siguen NULL, se
        // generan/persisten recién después de pasar esta validación. Mismo
        // criterio que el caso anterior: commit sin rollback, no hubo
        // ningún UPDATE que revertir.
        await this.transactionRepository.create(
          {
            originAccountId: origin.id,
            destAccountId: dest.id,
            amount,
            commission,
            authorizationCode: null,
            idempotencyKey: null,
            status: TransactionStatus.REJECTED,
          },
          trx,
        );
        return { ok: false, error: new InsufficientFundsException() };
      }

      const destBalance = new Prisma.Decimal(dest.balance);
      const newOriginBalance = originBalance.minus(totalDebit);
      const newDestBalance = destBalance.plus(amount);

      await this.accountRepository.updateBalance(origin.id, newOriginBalance, trx);
      await this.accountRepository.updateBalance(dest.id, newDestBalance, trx);

      const transaction = await this.transactionRepository.create(
        {
          originAccountId: origin.id,
          destAccountId: dest.id,
          amount,
          commission,
          authorizationCode: this.authCodeGenerator.generate(),
          idempotencyKey: command.idempotencyKey,
          status: TransactionStatus.COMPLETED,
        },
        trx,
      );
      return { ok: true, transaction };
    });

    if (!outcome.ok) {
      throw outcome.error;
    }
    return outcome.transaction;
  }

  /** Escritura suelta (sin `trx`) para los dos casos REJECTED/FAILED que
   * ocurren ANTES de `runInTransaction` (misma cuenta, timeout de
   * anti-fraude) — un solo INSERT ya es atómico por sí mismo, no hace
   * falta envolverlo en una transacción explícita (Sesión 6.5, tarea 6). */
  private async persistFailedAttempt(data: {
    status: typeof TransactionStatus.REJECTED | typeof TransactionStatus.FAILED;
    originAccountId: string;
    destAccountId: string | null;
    amount: Prisma.Decimal;
    commission: Prisma.Decimal | null;
  }): Promise<void> {
    await this.transactionRepository.create({
      originAccountId: data.originAccountId,
      destAccountId: data.destAccountId,
      amount: data.amount,
      commission: data.commission,
      authorizationCode: null,
      idempotencyKey: null,
      status: data.status,
    });
  }

  /**
   * RN-02: `Promise.race` entre la llamada simulada y un timeout — si el
   * timeout gana, aborta con `AntiFraudTimeoutException` (504, ver esa
   * clase). El `clearTimeout` en el `finally` es necesario, no cosmético:
   * sin él, cuando el anti-fraude responde rápido y gana la carrera, el
   * `setTimeout` del timeout sigue vivo de fondo y termina llamando
   * `reject()` sobre una promesa ya resuelta más tarde — no rompe nada
   * funcionalmente (`Promise.race` ya ignora settles posteriores), pero
   * deja un timer de Node colgando innecesariamente hasta que dispare, lo
   * cual además complica los tests que usan fake timers de Jest.
   */
  private async checkAntiFraud(input: {
    originAccountId: string;
    destAccountId: string;
    amount: string;
  }): Promise<void> {
    let timeoutHandle!: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new AntiFraudTimeoutException()), ANTI_FRAUD_TIMEOUT_MS);
    });

    try {
      await Promise.race([this.antiFraudService.check(input), timeout]);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
