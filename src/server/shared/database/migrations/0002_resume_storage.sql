ALTER TABLE "resume_files" DROP CONSTRAINT "resume_files_size_check";--> statement-breakpoint
ALTER TABLE "candidates" ALTER COLUMN "resume_text" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "resume_files" ADD COLUMN "storage_key" varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE "resume_files" DROP COLUMN "content";--> statement-breakpoint
ALTER TABLE "resume_files" ADD CONSTRAINT "resume_files_size_check" CHECK ("resume_files"."size_bytes" between 1 and 2097152);