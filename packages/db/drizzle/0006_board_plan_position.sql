ALTER TABLE "boards" ADD COLUMN "plan_floor_id" uuid;--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "plan_x" double precision;--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "plan_y" double precision;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_plan_floor_id_floors_id_fk" FOREIGN KEY ("plan_floor_id") REFERENCES "public"."floors"("id") ON DELETE set null ON UPDATE no action;