-- AlterTable
ALTER TABLE "transactions" ALTER COLUMN "dest_account_id" DROP NOT NULL,
ALTER COLUMN "commission" DROP NOT NULL,
ALTER COLUMN "idempotency_key" DROP NOT NULL;
