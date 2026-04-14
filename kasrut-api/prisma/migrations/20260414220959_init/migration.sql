-- CreateEnum
CREATE TYPE "Role" AS ENUM ('owner', 'rabbanut', 'mashgiach');

-- CreateEnum
CREATE TYPE "CertStatus" AS ENUM ('ok', 'warning', 'critical');

-- CreateEnum
CREATE TYPE "HechsherType" AS ENUM ('Rabbanut', 'Badatz', 'Mehadrin', 'Private');

-- CreateEnum
CREATE TYPE "InspectionResult" AS ENUM ('pending', 'open', 'pass', 'fail');

-- CreateEnum
CREATE TYPE "InspectionType" AS ENUM ('planned', 'urgent');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('Instructions', 'Forms', 'Regulations', 'Pesach');

-- CreateEnum
CREATE TYPE "DocExt" AS ENUM ('PDF', 'DOCX', 'XLSX');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "rabbanutId" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rabbanuts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT NOT NULL,

    CONSTRAINT "rabbanuts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hechsherim" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "type" "HechsherType" NOT NULL,
    "color" TEXT NOT NULL,
    "rabbanutId" TEXT NOT NULL,

    CONSTRAINT "hechsherim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mashgichim" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "rabbanutId" TEXT NOT NULL,

    CONSTRAINT "mashgichim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mashgiach_hechsher" (
    "mashgiachId" TEXT NOT NULL,
    "hechsherId" TEXT NOT NULL,

    CONSTRAINT "mashgiach_hechsher_pkey" PRIMARY KEY ("mashgiachId","hechsherId")
);

-- CreateTable
CREATE TABLE "restaurants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "hechsherId" TEXT NOT NULL,
    "mashgiachId" TEXT NOT NULL,
    "kitniyot" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "status" "CertStatus" NOT NULL DEFAULT 'ok',
    "rabbanutId" TEXT NOT NULL,
    "notes" TEXT,
    "lastInspection" TIMESTAMP(3),

    CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "mashgiachId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "InspectionType" NOT NULL,
    "result" "InspectionResult" NOT NULL DEFAULT 'pending',
    "notes" TEXT,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "size" TEXT NOT NULL,
    "ext" "DocExt" NOT NULL,
    "url" TEXT,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_rabbanutId_fkey" FOREIGN KEY ("rabbanutId") REFERENCES "rabbanuts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hechsherim" ADD CONSTRAINT "hechsherim_rabbanutId_fkey" FOREIGN KEY ("rabbanutId") REFERENCES "rabbanuts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mashgichim" ADD CONSTRAINT "mashgichim_rabbanutId_fkey" FOREIGN KEY ("rabbanutId") REFERENCES "rabbanuts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mashgiach_hechsher" ADD CONSTRAINT "mashgiach_hechsher_mashgiachId_fkey" FOREIGN KEY ("mashgiachId") REFERENCES "mashgichim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mashgiach_hechsher" ADD CONSTRAINT "mashgiach_hechsher_hechsherId_fkey" FOREIGN KEY ("hechsherId") REFERENCES "hechsherim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_hechsherId_fkey" FOREIGN KEY ("hechsherId") REFERENCES "hechsherim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_mashgiachId_fkey" FOREIGN KEY ("mashgiachId") REFERENCES "mashgichim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_rabbanutId_fkey" FOREIGN KEY ("rabbanutId") REFERENCES "rabbanuts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_mashgiachId_fkey" FOREIGN KEY ("mashgiachId") REFERENCES "mashgichim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
