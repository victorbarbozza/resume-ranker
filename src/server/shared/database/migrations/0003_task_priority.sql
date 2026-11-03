DROP INDEX "idx_tasks_queued_run_at";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "priority" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_tasks_queued_priority_run_at" ON "tasks" USING btree ("priority" DESC NULLS LAST,"run_at") WHERE "tasks"."status" = 'queued';--> statement-breakpoint
UPDATE "tasks" SET "priority" = 2 WHERE "type" = 'job.analyze' AND "status" = 'queued';--> statement-breakpoint
UPDATE "tasks" SET "priority" = 1 WHERE "type" = 'candidates.evaluate' AND "status" = 'queued';
