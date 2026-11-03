ALTER TABLE "evaluations" ADD COLUMN "assessments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "evaluations" DROP COLUMN "strengths";--> statement-breakpoint
ALTER TABLE "evaluations" DROP COLUMN "gaps";--> statement-breakpoint
UPDATE "jobs" SET "requirements" = jsonb_build_object(
  'mustHave', coalesce((SELECT jsonb_agg(jsonb_build_object('text', item, 'importance', 'primary')) FROM jsonb_array_elements_text("requirements" -> 'mustHave') AS item), '[]'::jsonb),
  'niceToHave', coalesce("requirements" -> 'niceToHave', '[]'::jsonb),
  'experience', jsonb_build_object('minYears', NULL, 'seniority', NULL)
) WHERE "requirements" IS NOT NULL AND NOT "requirements" ? 'experience';--> statement-breakpoint
UPDATE "evaluations" SET "status" = 'failed' WHERE "status" = 'queued';--> statement-breakpoint
DELETE FROM "tasks" WHERE "type" = 'candidates.evaluate' AND "status" IN ('queued', 'running');
