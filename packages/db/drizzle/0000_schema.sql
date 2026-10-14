CREATE TYPE "public"."curve" AS ENUM('B', 'C', 'D');--> statement-breakpoint
CREATE TYPE "public"."element_kind" AS ENUM('rcd', 'breaker', 'hphc_contactor', 'impulse_relay', 'surge_protector', 'energy_meter', 'connected_module', 'relay', 'spare', 'custom');--> statement-breakpoint
CREATE TYPE "public"."fixture_kind" AS ENUM('socket', 'light', 'appliance', 'zone', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."photo_usage" AS ENUM('board', 'element', 'fixture', 'floor_background');--> statement-breakpoint
CREATE TYPE "public"."rcd_type" AS ENUM('AC', 'A', 'F', 'B');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."verification" AS ENUM('verified', 'assumed', 'unknown');--> statement-breakpoint
CREATE TABLE "board_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"board_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"capacity" integer NOT NULL,
	CONSTRAINT "board_rows_index_positive" CHECK ("board_rows"."index" >= 0),
	CONSTRAINT "board_rows_capacity_positive" CHECK ("board_rows"."capacity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"property_id" uuid NOT NULL,
	"name" text NOT NULL,
	"location" text,
	"photo_id" uuid,
	"rows" integer NOT NULL,
	"modules_per_row" integer NOT NULL,
	"notes" text,
	CONSTRAINT "boards_rows_positive" CHECK ("boards"."rows" >= 1),
	CONSTRAINT "boards_modules_positive" CHECK ("boards"."modules_per_row" >= 1)
);
--> statement-breakpoint
CREATE TABLE "circuits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"fixture_id" uuid NOT NULL,
	"breaker_id" uuid,
	"status" "verification" DEFAULT 'unknown' NOT NULL,
	"notes" text,
	CONSTRAINT "circuits_fixture_id_unique" UNIQUE("fixture_id"),
	CONSTRAINT "circuits_unlinked_is_unknown" CHECK ("circuits"."breaker_id" IS NOT NULL OR "circuits"."status" = 'unknown')
);
--> statement-breakpoint
CREATE TABLE "elements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"row_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"width" integer NOT NULL,
	"kind" "element_kind" NOT NULL,
	"label" text NOT NULL,
	"role" text,
	"brand" text,
	"model" text,
	"notes" text,
	"photo_id" uuid,
	"outgoing_cables" integer,
	"cable_section" numeric(5, 2),
	"rating_a" integer,
	"poles" integer,
	"curve" "curve",
	"sensitivity_ma" integer,
	"rcd_type" "rcd_type",
	"protected_by_rcd_id" uuid,
	CONSTRAINT "elements_position_positive" CHECK ("elements"."position" >= 0),
	CONSTRAINT "elements_width_positive" CHECK ("elements"."width" >= 1),
	CONSTRAINT "elements_poles_range" CHECK ("elements"."poles" IS NULL OR "elements"."poles" BETWEEN 1 AND 4),
	CONSTRAINT "elements_rating_positive" CHECK ("elements"."rating_a" IS NULL OR "elements"."rating_a" > 0),
	CONSTRAINT "elements_section_positive" CHECK ("elements"."cable_section" IS NULL OR "elements"."cable_section" > 0)
);
--> statement-breakpoint
CREATE TABLE "fixtures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"room_id" uuid NOT NULL,
	"kind" "fixture_kind" NOT NULL,
	"label" text NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"notes" text,
	"photo_id" uuid
);
--> statement-breakpoint
CREATE TABLE "floors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"property_id" uuid NOT NULL,
	"name" text NOT NULL,
	"index" integer NOT NULL,
	"background_image_id" uuid,
	"background_opacity" double precision DEFAULT 1 NOT NULL,
	"background_x" double precision DEFAULT 0 NOT NULL,
	"background_y" double precision DEFAULT 0 NOT NULL,
	"background_scale" double precision DEFAULT 1 NOT NULL,
	"background_locked" boolean DEFAULT false NOT NULL,
	"width" double precision NOT NULL,
	"height" double precision NOT NULL,
	CONSTRAINT "floors_opacity_range" CHECK ("floors"."background_opacity" BETWEEN 0 AND 1),
	CONSTRAINT "floors_scale_positive" CHECK ("floors"."background_scale" > 0),
	CONSTRAINT "floors_size_positive" CHECK ("floors"."width" > 0 AND "floors"."height" > 0)
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"property_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "role" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"invited_by" uuid,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invitations_role_not_owner" CHECK ("invitations"."role" <> 'owner')
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"property_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"property_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"size_bytes" integer NOT NULL,
	"usage" "photo_usage" NOT NULL,
	CONSTRAINT "photos_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"floor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"w" double precision NOT NULL,
	"h" double precision NOT NULL,
	CONSTRAINT "rooms_size_positive" CHECK ("rooms"."w" > 0 AND "rooms"."h" > 0)
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"board_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "share_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_rows" ADD CONSTRAINT "board_rows_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_rows" ADD CONSTRAINT "board_rows_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circuits" ADD CONSTRAINT "circuits_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circuits" ADD CONSTRAINT "circuits_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circuits" ADD CONSTRAINT "circuits_breaker_id_elements_id_fk" FOREIGN KEY ("breaker_id") REFERENCES "public"."elements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elements" ADD CONSTRAINT "elements_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elements" ADD CONSTRAINT "elements_row_id_board_rows_id_fk" FOREIGN KEY ("row_id") REFERENCES "public"."board_rows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elements" ADD CONSTRAINT "elements_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elements" ADD CONSTRAINT "elements_protected_by_rcd_id_elements_id_fk" FOREIGN KEY ("protected_by_rcd_id") REFERENCES "public"."elements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floors" ADD CONSTRAINT "floors_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floors" ADD CONSTRAINT "floors_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floors" ADD CONSTRAINT "floors_background_image_id_photos_id_fk" FOREIGN KEY ("background_image_id") REFERENCES "public"."photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_floor_id_floors_id_fk" FOREIGN KEY ("floor_id") REFERENCES "public"."floors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "board_rows_board_index_unique" ON "board_rows" USING btree ("board_id","index");--> statement-breakpoint
CREATE INDEX "boards_property_idx" ON "boards" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "circuits_breaker_idx" ON "circuits" USING btree ("breaker_id");--> statement-breakpoint
CREATE INDEX "elements_row_idx" ON "elements" USING btree ("row_id");--> statement-breakpoint
CREATE INDEX "fixtures_room_idx" ON "fixtures" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "floors_property_index_unique" ON "floors" USING btree ("property_id","index");--> statement-breakpoint
CREATE INDEX "invitations_property_idx" ON "invitations" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_property_user_unique" ON "memberships" USING btree ("property_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "photos_property_idx" ON "photos" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "rooms_floor_idx" ON "rooms" USING btree ("floor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_one_active_per_board" ON "share_links" USING btree ("board_id") WHERE "share_links"."revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));