CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(200),
	"file_name" varchar(255) NOT NULL,
	"content_hash" char(64) NOT NULL,
	"resume_text" text NOT NULL,
	"profile" jsonb,
	"profile_model" varchar(100),
	"profile_prompt_version" varchar(32),
	"areas" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "candidates_status_check" CHECK ("candidates"."status" in ('pending', 'ready', 'failed')),
	CONSTRAINT "candidates_areas_check" CHECK ("candidates"."areas" <@ array['engineering', 'data', 'design', 'product', 'marketing', 'sales', 'finance', 'people', 'operations', 'other']::text[])
);
--> statement-breakpoint
CREATE TABLE "evaluations" (
	"job_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"job_version" integer NOT NULL,
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"score" smallint,
	"summary" text,
	"strengths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" varchar(100),
	"prompt_version" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluations_pkey" PRIMARY KEY("job_id","candidate_id"),
	CONSTRAINT "evaluations_status_check" CHECK ("evaluations"."status" in ('queued', 'done', 'failed')),
	CONSTRAINT "evaluations_score_check" CHECK ("evaluations"."score" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text NOT NULL,
	"area" varchar(32) NOT NULL,
	"requirements" jsonb,
	"requirements_model" varchar(100),
	"requirements_prompt_version" varchar(32),
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "jobs_area_check" CHECK ("jobs"."area" in ('engineering', 'data', 'design', 'product', 'marketing', 'sales', 'finance', 'people', 'operations', 'other')),
	CONSTRAINT "jobs_status_check" CHECK ("jobs"."status" in ('pending', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" varchar(128) NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_pkey" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "resume_files" (
	"candidate_id" uuid PRIMARY KEY NOT NULL,
	"content" "bytea" NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resume_files_size_check" CHECK ("resume_files"."size_bytes" between 1 and 5242880)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id_hash" char(64) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" varchar(64) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_type_check" CHECK ("tasks"."type" in ('job.analyze', 'candidate.extract_profile', 'candidates.evaluate')),
	CONSTRAINT "tasks_status_check" CHECK ("tasks"."status" in ('queued', 'running', 'done', 'dead'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" varchar(64) NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_key" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_files" ADD CONSTRAINT "resume_files_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "candidates_content_hash_key" ON "candidates" USING btree ("content_hash") WHERE "candidates"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_candidates_areas" ON "candidates" USING gin ("areas");--> statement-breakpoint
CREATE INDEX "idx_evaluations_candidate_id" ON "evaluations" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_user_id" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_queued_run_at" ON "tasks" USING btree ("run_at") WHERE "tasks"."status" = 'queued';