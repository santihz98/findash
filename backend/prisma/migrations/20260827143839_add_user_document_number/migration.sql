-- RF-03: agrega el documento de identidad del usuario (cédula/DNI/RUC), el
-- campo por el que el admin filtra/busca cuentas ("por Documento").
--
-- Se agrega en tres pasos (nullable -> backfill -> NOT NULL) en vez de un
-- ADD COLUMN ... NOT NULL directo porque la tabla "users" ya puede tener
-- filas (los 4 usuarios de demo del seed de la Sesión 1) sin este valor.
-- El backfill usa un placeholder único derivado del id; prisma/seed.ts ya
-- actualiza documentNumber en usuarios existentes (ver ese archivo), así que
-- correr `prisma db seed` después de esta migración reemplaza el
-- placeholder por el documento real de cada usuario de demo.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "document_number" TEXT;

-- Backfill
UPDATE "users" SET "document_number" = 'PENDING-' || "id" WHERE "document_number" IS NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "document_number" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_document_number_key" ON "users"("document_number");
