CREATE TABLE "custom_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"role" text,
	"brand" text,
	"model" text,
	"width" integer NOT NULL,
	CONSTRAINT "custom_models_width_positive" CHECK ("custom_models"."width" >= 1)
);
--> statement-breakpoint
ALTER TABLE "custom_models" ADD CONSTRAINT "custom_models_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_models" ADD CONSTRAINT "custom_models_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_models_user_idx" ON "custom_models" USING btree ("user_id");