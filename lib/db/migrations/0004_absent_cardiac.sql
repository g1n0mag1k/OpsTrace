ALTER TABLE "inspection_records" ALTER COLUMN "inspected_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "inspection_records" ADD COLUMN "user_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "inspection_records" ADD COLUMN "locked_at" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "inspection_records" ADD CONSTRAINT "inspection_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;