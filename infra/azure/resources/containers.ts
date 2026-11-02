import * as app from '@pulumi/azure-native/app'
import * as pulumi from '@pulumi/pulumi'

import type { Database } from './database'
import type { Files } from './files'
import type { Llm } from './llm'

/** The smallest size Container Apps runs; one process serves the API and works the queue in it */
const RESOURCES = { cpu: 0.25, memory: '0.5Gi' }

/** The route the probes and the release ask */
const HEALTH = { path: '/api/health', port: 3000 }

/** What the containers run on and connect to */
export type ContainersInput = {
  resourceGroupName: pulumi.Input<string>
  names: { environment: string; app: string; migrateJob: string }
  image: string
  database: Database
  files: Files
  llm: Llm
}

/**
 * The app and the migration job, as the release addresses them.
 *
 * - `url`: the app's public address; it comes from a configuration that holds secrets, so it is marked plain, or `pulumi stack output` would print [secret]
 */
export type Containers = {
  appName: pulumi.Output<string>
  migrateJobName: pulumi.Output<string>
  url: pulumi.Output<string>
}

/**
 * The Container Apps environment, the app and the migration job. The
 * environment has no logs destination, so nothing is stored or billed; the
 * portal's log stream still shows the app live.
 *
 * The app runs one replica, always on, so no request waits for a cold start
 * and the LLM pace held in memory stays right; HTTPS comes with its address.
 * The job runs the migrations before each release. The release changes the
 * image of both, so Pulumi leaves the image out of its diff.
 */
export const createContainers = ({
  resourceGroupName,
  names,
  image,
  database,
  files,
  llm,
}: ContainersInput): Containers => {
  const environment = new app.ManagedEnvironment('environment', {
    resourceGroupName,
    environmentName: names.environment,
  })

  const service = new app.ContainerApp(
    'app',
    {
      resourceGroupName,
      containerAppName: names.app,
      managedEnvironmentId: environment.id,
      configuration: {
        activeRevisionsMode: app.ActiveRevisionsMode.Single,
        ingress: {
          external: true,
          targetPort: HEALTH.port,
          transport: app.IngressTransportMethod.Auto,
          allowInsecure: false,
        },
        secrets: [
          { name: 'database-url', value: database.url },
          { name: 'azure-api-key', value: llm.key },
          { name: 'azure-storage-key', value: files.key },
        ],
      },
      template: {
        containers: [
          {
            name: 'app',
            image,
            resources: RESOURCES,
            env: [
              { name: 'DATABASE_URL', secretRef: 'database-url' },
              {
                name: 'LLM_MODEL',
                value: pulumi.interpolate`azure:${llm.deploymentName}`,
              },
              { name: 'AZURE_RESOURCE_NAME', value: llm.resourceName },
              { name: 'AZURE_API_KEY', secretRef: 'azure-api-key' },
              { name: 'STORAGE_DRIVER', value: 'azure' },
              { name: 'AZURE_STORAGE_ACCOUNT', value: files.accountName },
              { name: 'AZURE_STORAGE_CONTAINER', value: files.containerName },
              { name: 'AZURE_STORAGE_KEY', secretRef: 'azure-storage-key' },
            ],
            probes: [
              { type: app.Type.Readiness, httpGet: HEALTH, periodSeconds: 10 },
              { type: app.Type.Liveness, httpGet: HEALTH, periodSeconds: 30 },
            ],
          },
        ],
        scale: { minReplicas: 1, maxReplicas: 1 },
      },
    },
    { ignoreChanges: ['template.containers[0].image'] }
  )

  const migrate = new app.Job(
    'migrate',
    {
      resourceGroupName,
      jobName: names.migrateJob,
      environmentId: environment.id,
      configuration: {
        triggerType: app.TriggerType.Manual,
        replicaTimeout: 600,
        replicaRetryLimit: 0,
        manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 },
        secrets: [{ name: 'database-url', value: database.url }],
      },
      template: {
        containers: [
          {
            name: 'migrate',
            image,
            command: ['node', 'migrate.mjs'],
            resources: RESOURCES,
            env: [{ name: 'DATABASE_URL', secretRef: 'database-url' }],
          },
        ],
      },
    },
    { ignoreChanges: ['template.containers[0].image'] }
  )

  const fqdn = pulumi.unsecret(
    service.configuration.apply((configuration) => configuration?.ingress?.fqdn)
  )
  return {
    appName: service.name,
    migrateJobName: migrate.name,
    url: pulumi.interpolate`https://${fqdn}`,
  }
}
