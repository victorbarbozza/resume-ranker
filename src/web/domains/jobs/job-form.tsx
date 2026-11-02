import { useNavigate } from '@tanstack/react-router'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { AREAS } from '@/shared/areas'
import {
  JOB_DESCRIPTION_MAX_LENGTH,
  JOB_TITLE_MAX_LENGTH,
} from '@/shared/limits'
import { Button } from '@/web/components/button'
import { SelectField, TextAreaField, TextField } from '@/web/components/field'
import { Sheet } from '@/web/components/sheet'
import { describeError, type FieldIssue, toApiFailure } from '@/web/lib/api'
import { areaLabel, formatNumber } from '@/web/lib/format'

import styles from './jobs.module.css'
import { type JobInput, useCreateJob, useUpdateJob } from './queries'

/** An empty job, as a new one starts */
const EMPTY_JOB: JobInput = { title: '', description: '', area: 'engineering' }

/**
 * Props of the job form.
 *
 * - `job`: the job being edited; a new job when absent
 * - `onDelete`: shown as Delete job at the left of the footer when editing
 */
interface JobFormProps {
  open: boolean
  onClose: () => void
  job?: JobInput & { id: string; version: number }
  onDelete?: () => void
}

/**
 * Creates a job, or edits one, in a sheet. A new job opens its page, where its
 * requirements appear once the model has read the description. An edit bumps
 * the job's version, so its results show as stale until ranked again; the
 * sheet says so before saving.
 */
export function JobForm({ open, onClose, job, onDelete }: JobFormProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const create = useCreateJob()
  const update = useUpdateJob()

  const save = (
    input: JobInput,
    showIssues: (issues: FieldIssue[]) => void
  ) => {
    const onError = (error: unknown) => {
      const failure = toApiFailure(error)
      if (failure.details.length > 0) showIssues(failure.details)
      else toast.error(describeError(error))
    }
    if (job) {
      update.mutate(
        { jobId: job.id, input },
        {
          onSuccess: () => {
            toast.success(t('jobs.saved'))
            onClose()
          },
          onError,
        }
      )
      return
    }
    create.mutate(input, {
      onSuccess: (created) => {
        toast.success(t('jobs.created'))
        onClose()
        navigate({ to: '/jobs/$jobId', params: { jobId: created.id } })
      },
      onError,
    })
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={job ? t('jobs.editTitle') : t('jobs.newTitle')}
      description={
        job
          ? t('jobs.editDescription', { version: job.version + 1 })
          : t('jobs.newDescription')
      }
      footerStart={
        job &&
        onDelete && (
          <Button variant="plainDestructive" onClick={onDelete}>
            {t('jobs.deleteJob')}
          </Button>
        )
      }
      footer={
        <Button
          type="submit"
          form="job-form"
          variant="primary"
          loading={create.isPending || update.isPending}
        >
          {job ? t('common.save') : t('jobs.create')}
        </Button>
      }
    >
      <JobFields
        key={open ? 'open' : 'closed'}
        initial={
          job
            ? { title: job.title, description: job.description, area: job.area }
            : EMPTY_JOB
        }
        onSubmit={save}
      />
    </Sheet>
  )
}

/**
 * The fields, filled once each time the sheet opens, so a refresh of the job
 * while the sheet is open never overwrites what the person typed. A field the
 * API refuses is marked, with the reason in the person's language.
 */
function JobFields({
  initial,
  onSubmit,
}: {
  initial: JobInput
  onSubmit: (
    input: JobInput,
    showIssues: (issues: FieldIssue[]) => void
  ) => void
}) {
  const { t } = useTranslation()
  const { register, handleSubmit, setError, control, formState } =
    useForm<JobInput>({ defaultValues: initial })

  const submit = handleSubmit((input) =>
    onSubmit(input, (issues) => {
      for (const issue of issues) {
        const field = issue.path.slice(1)
        if (field === 'title' || field === 'description' || field === 'area') {
          setError(field, { message: t('errors.VALIDATION_ERROR') })
        }
      }
    })
  )
  const descriptionLength = useWatch({ control, name: 'description' }).length

  return (
    <form id="job-form" className={styles.form} onSubmit={submit}>
      <TextField
        label={t('jobs.fieldTitle')}
        placeholder={t('jobs.titlePlaceholder')}
        maxLength={JOB_TITLE_MAX_LENGTH}
        error={formState.errors.title?.message}
        {...register('title', { required: t('jobs.titleRequired') })}
      />
      <Controller
        control={control}
        name="area"
        render={({ field, fieldState }) => (
          <SelectField
            label={t('jobs.fieldArea')}
            hint={t('jobs.areaHint')}
            error={fieldState.error?.message}
            value={field.value}
            onChange={field.onChange}
            choices={AREAS.map((area) => ({
              value: area,
              label: areaLabel(area),
            }))}
          />
        )}
      />
      <TextAreaField
        label={t('jobs.fieldDescription')}
        rows={11}
        maxLength={JOB_DESCRIPTION_MAX_LENGTH}
        counter={t('jobs.characters', {
          length: formatNumber(descriptionLength),
          max: formatNumber(JOB_DESCRIPTION_MAX_LENGTH),
        })}
        error={formState.errors.description?.message}
        {...register('description', {
          required: t('jobs.descriptionRequired'),
        })}
      />
    </form>
  )
}
