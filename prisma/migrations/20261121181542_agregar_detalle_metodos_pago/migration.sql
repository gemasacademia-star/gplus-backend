-- AlterTable
ALTER TABLE "metodos_pago" ADD COLUMN     "banco" VARCHAR(80),
ADD COLUMN     "cci" VARCHAR(50),
ADD COLUMN     "detalle_instrucciones" TEXT,
ADD COLUMN     "numero_cuenta" VARCHAR(50),
ADD COLUMN     "numero_telefono" VARCHAR(30),
ADD COLUMN     "titular" VARCHAR(150);
