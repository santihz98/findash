import { PrismaClient, Role, AccountType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Password compartida por los 4 usuarios de demo. El hash se genera con
// bcryptjs (mismo algoritmo que usará el AuthModule en la Sesión 2) — nunca
// se guarda en texto plano, aunque el valor en sí sea conocido/público para
// efectos de la demo.
const DEMO_PASSWORD = 'Demo1234!';
const INITIAL_BALANCE = '1000.00';

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
}) {
  return prisma.account.upsert({
    where: { accountNumber: params.accountNumber },
    update: {},
    create: {
      userId: params.userId,
      accountNumber: params.accountNumber,
      accountType: params.accountType,
      balance: INITIAL_BALANCE,
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
}> = [
  {
    email: 'basic@findash.dev',
    documentNumber: '1010000002',
    accountType: AccountType.BASIC,
    accountNumber: '1000000001',
  },
  {
    email: 'premium@findash.dev',
    documentNumber: '1010000003',
    accountType: AccountType.PREMIUM,
    accountNumber: '1000000002',
  },
  {
    email: 'corporate@findash.dev',
    documentNumber: '1010000004',
    accountType: AccountType.CORPORATE,
    accountNumber: '1000000003',
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
    });
  }

  console.log('Seed OK — usuarios de demo (password para todos: %s):', DEMO_PASSWORD);
  console.log(`  ADMIN      ${ADMIN.email.padEnd(22)} (documento ${ADMIN.documentNumber})`);
  for (const client of CLIENTS) {
    console.log(
      `  CLIENT     ${client.email.padEnd(22)} (documento ${client.documentNumber}, ${client.accountType}, cuenta ${client.accountNumber}, saldo $${INITIAL_BALANCE})`,
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
