import { PrismaClient, Role, AccountType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Password compartida por los 10 usuarios de demo (1 ADMIN + 9 CLIENT desde
// la Sesión 26). El hash se genera con bcryptjs (mismo algoritmo que usará
// el AuthModule en la Sesión 2) — nunca se guarda en texto plano, aunque el
// valor en sí sea conocido/público para efectos de la demo.
const DEMO_PASSWORD = 'Demo1234!';

async function upsertUser(email: string, documentNumber: string, role: Role) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  return prisma.user.upsert({
    where: { email },
    // update: sincroniza documentNumber también en usuarios que ya existían
    // (ej. los backfilleados con el placeholder "PENDING-<id>" que agrega la
    // migración de Sesión 1.5) — sin esto, un upsert por email nunca los
    // hubiera corregido.
    update: { documentNumber },
    create: { email, documentNumber, passwordHash, role },
  });
}

async function upsertAccount(params: {
  userId: string;
  accountNumber: string;
  accountType: AccountType;
  balance: string;
}) {
  return prisma.account.upsert({
    where: { accountNumber: params.accountNumber },
    // update: {} (no `balance`) a propósito — mismo criterio de idempotencia
    // que desde la Sesión 1: correr el seed de nuevo contra una base que ya
    // tiene movimientos reales (transferencias hechas en la demo/sustentación)
    // no debe resetear el saldo a su valor inicial.
    update: {},
    create: {
      userId: params.userId,
      accountNumber: params.accountNumber,
      accountType: params.accountType,
      balance: params.balance,
      status: 'ACTIVE',
    },
  });
}

// documentNumber de ejemplo con un prefijo distinto (1010...) al de
// accountNumber (1000...) solo para que sean visualmente distinguibles en
// logs/consultas — no hay ninguna relación real entre ambos valores.
const ADMIN = { email: 'admin@findash.dev', documentNumber: '1010000001' };

const CLIENTS: Array<{
  email: string;
  documentNumber: string;
  accountType: AccountType;
  accountNumber: string;
  balance: string;
}> = [
  {
    email: 'basic@findash.dev',
    documentNumber: '1010000002',
    accountType: AccountType.BASIC,
    accountNumber: '1000000001',
    balance: '1000.00',
  },
  {
    email: 'premium@findash.dev',
    documentNumber: '1010000003',
    accountType: AccountType.PREMIUM,
    accountNumber: '1000000002',
    balance: '1000.00',
  },
  {
    email: 'corporate@findash.dev',
    documentNumber: '1010000004',
    accountType: AccountType.CORPORATE,
    accountNumber: '1000000003',
    balance: '1000.00',
  },
  // Sesión 26: 2 usuarios más por tipo de cuenta (feedback real: solo 1 por
  // tipo daba poca variedad para demostrar filtros/auditoría en la
  // sustentación) — documentNumber/accountNumber correlativos, continuando
  // la secuencia de arriba sin colisionar. Saldos variados a propósito (no
  // todos $1000.00, ver PROGRESS.md Sesión 26) para que el dashboard/
  // auditoría tengan datos de entrada más interesantes desde el primer login.
  {
    email: 'basic2@findash.dev',
    documentNumber: '1010000005',
    accountType: AccountType.BASIC,
    accountNumber: '1000000004',
    balance: '250.75',
  },
  {
    email: 'basic3@findash.dev',
    documentNumber: '1010000006',
    accountType: AccountType.BASIC,
    accountNumber: '1000000005',
    balance: '5230.00',
  },
  {
    email: 'premium2@findash.dev',
    documentNumber: '1010000007',
    accountType: AccountType.PREMIUM,
    accountNumber: '1000000006',
    balance: '820.40',
  },
  {
    email: 'premium3@findash.dev',
    documentNumber: '1010000008',
    accountType: AccountType.PREMIUM,
    accountNumber: '1000000007',
    balance: '15320.90',
  },
  {
    email: 'corporate2@findash.dev',
    documentNumber: '1010000009',
    accountType: AccountType.CORPORATE,
    accountNumber: '1000000008',
    balance: '3200.00',
  },
  {
    email: 'corporate3@findash.dev',
    documentNumber: '1010000010',
    accountType: AccountType.CORPORATE,
    accountNumber: '1000000009',
    balance: '97500.00',
  },
];

async function main() {
  await upsertUser(ADMIN.email, ADMIN.documentNumber, Role.ADMIN);

  for (const client of CLIENTS) {
    const user = await upsertUser(client.email, client.documentNumber, Role.CLIENT);
    await upsertAccount({
      userId: user.id,
      accountNumber: client.accountNumber,
      accountType: client.accountType,
      balance: client.balance,
    });
  }

  console.log('Seed OK — usuarios de demo (password para todos: %s):', DEMO_PASSWORD);
  console.log(`  ADMIN      ${ADMIN.email.padEnd(22)} (documento ${ADMIN.documentNumber})`);
  for (const client of CLIENTS) {
    console.log(
      `  CLIENT     ${client.email.padEnd(22)} (documento ${client.documentNumber}, ${client.accountType}, cuenta ${client.accountNumber}, saldo $${client.balance})`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
