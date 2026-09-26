-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('PASSENGER', 'DRIVER');

-- CreateEnum
CREATE TYPE "ride_status" AS ENUM ('REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "pool_status" AS ENUM ('OPEN', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "cancel_actor" AS ENUM ('PASSENGER', 'DRIVER');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "grid_x" INTEGER NOT NULL,
    "grid_y" INTEGER NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "current_zone_id" INTEGER,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_requests" (
    "id" UUID NOT NULL,
    "passenger_id" UUID NOT NULL,
    "pickup_zone_id" INTEGER NOT NULL,
    "dropoff_zone_id" INTEGER NOT NULL,
    "seats" INTEGER NOT NULL,
    "distance_km" INTEGER NOT NULL,
    "status" "ride_status" NOT NULL DEFAULT 'REQUESTED',
    "cancelled_by" "cancel_actor",
    "estimate_solo_paisa" INTEGER NOT NULL,
    "estimate_pooled_paisa" INTEGER NOT NULL,
    "fare_base_paisa" INTEGER,
    "fare_distance_paisa" INTEGER,
    "fare_discount_paisa" INTEGER,
    "fare_total_paisa" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ride_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pools" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "pickup_zone_id" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "seats_taken" INTEGER NOT NULL DEFAULT 0,
    "status" "pool_status" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pool_members" (
    "id" UUID NOT NULL,
    "pool_id" UUID NOT NULL,
    "ride_request_id" UUID NOT NULL,
    "seats" INTEGER NOT NULL,
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(3),
    "left_reason" TEXT,

    CONSTRAINT "pool_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_events" (
    "id" BIGSERIAL NOT NULL,
    "ride_request_id" UUID,
    "pool_id" UUID,
    "actor_user_id" UUID,
    "type" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "zones_name_key" ON "zones"("name");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_driver_id_key" ON "vehicles"("driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plate_key" ON "vehicles"("plate");

-- CreateIndex
CREATE INDEX "ride_requests_status_pickup_zone_id_idx" ON "ride_requests"("status", "pickup_zone_id");

-- CreateIndex
CREATE INDEX "ride_requests_passenger_id_created_at_idx" ON "ride_requests"("passenger_id", "created_at");

-- CreateIndex
CREATE INDEX "pools_status_pickup_zone_id_idx" ON "pools"("status", "pickup_zone_id");

-- CreateIndex
CREATE INDEX "pools_vehicle_id_created_at_idx" ON "pools"("vehicle_id", "created_at");

-- CreateIndex
CREATE INDEX "pool_members_pool_id_idx" ON "pool_members"("pool_id");

-- CreateIndex
CREATE INDEX "ride_events_ride_request_id_created_at_idx" ON "ride_events"("ride_request_id", "created_at");

-- CreateIndex
CREATE INDEX "ride_events_pool_id_created_at_idx" ON "ride_events"("pool_id", "created_at");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_current_zone_id_fkey" FOREIGN KEY ("current_zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_pickup_zone_id_fkey" FOREIGN KEY ("pickup_zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_dropoff_zone_id_fkey" FOREIGN KEY ("dropoff_zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pools" ADD CONSTRAINT "pools_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pools" ADD CONSTRAINT "pools_pickup_zone_id_fkey" FOREIGN KEY ("pickup_zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pool_members" ADD CONSTRAINT "pool_members_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pool_members" ADD CONSTRAINT "pool_members_ride_request_id_fkey" FOREIGN KEY ("ride_request_id") REFERENCES "ride_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_ride_request_id_fkey" FOREIGN KEY ("ride_request_id") REFERENCES "ride_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Integrity rules Prisma's schema language can't express (hand-written).
-- These are the database's last line of defence; services enforce the same rules first.
-- ---------------------------------------------------------------------------
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_capacity_check" CHECK ("capacity" BETWEEN 1 AND 6);
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_online_needs_zone_check" CHECK (NOT "is_online" OR "current_zone_id" IS NOT NULL);

ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_seats_check" CHECK ("seats" >= 1);
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_distinct_zones_check" CHECK ("pickup_zone_id" <> "dropoff_zone_id");
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_money_check" CHECK (
  "estimate_solo_paisa" >= 0 AND "estimate_pooled_paisa" >= 0 AND ("fare_total_paisa" IS NULL OR "fare_total_paisa" >= 0)
);

-- Bullet can never carry more seats than it has.
ALTER TABLE "pools" ADD CONSTRAINT "pools_seats_check" CHECK ("seats_taken" BETWEEN 0 AND "capacity");
ALTER TABLE "pool_members" ADD CONSTRAINT "pool_members_seats_check" CHECK ("seats" >= 1);

-- A passenger has at most one active ride.
CREATE UNIQUE INDEX "ride_requests_one_active_per_passenger" ON "ride_requests" ("passenger_id")
  WHERE "status" IN ('REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED');
-- A Tesla has at most one active pool.
CREATE UNIQUE INDEX "pools_one_active_per_vehicle" ON "pools" ("vehicle_id")
  WHERE "status" IN ('OPEN', 'DRIVER_ARRIVED', 'STARTED');
-- A ride request sits in at most one pool at a time.
CREATE UNIQUE INDEX "pool_members_one_current_membership" ON "pool_members" ("ride_request_id")
  WHERE "left_at" IS NULL;
