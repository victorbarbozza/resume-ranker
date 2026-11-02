import * as postgres from '@pulumi/azure-native/dbforpostgresql'
import * as pulumi from '@pulumi/pulumi'
import * as random from '@pulumi/random'

/** The login the app and the migrations use */
const LOGIN = 'resumeranker'

/** The database, as the app connects to it */
export type Database = {
  url: pulumi.Output<string>
  host: pulumi.Output<string>
}

/**
 * PostgreSQL 16 on the smallest burstable size, 32 GB that never grow, so it
 * stays in the free offer, and 7 days of backups. Only TLS connections from
 * Azure services get in. The password is drawn here and kept encrypted in
 * the stack; the URL is a secret too. The password, the server and the
 * database are protected: Pulumi refuses to delete or replace them, so a
 * mistake fails the deploy instead of losing the data.
 */
export const createDatabase = (
  resourceGroupName: pulumi.Input<string>,
  serverName: pulumi.Input<string>
): Database => {
  const password = new random.RandomPassword(
    'database-password',
    {
      length: 32,
      special: false,
      minUpper: 2,
      minLower: 2,
      minNumeric: 2,
    },
    { protect: true }
  )
  const server = new postgres.Server(
    'database',
    {
      resourceGroupName,
      serverName,
      version: postgres.PostgresMajorVersion.PostgresMajorVersion_16,
      sku: { name: 'Standard_B1ms', tier: postgres.SkuTier.Burstable },
      storage: {
        storageSizeGB: 32,
        autoGrow: postgres.StorageAutoGrow.Disabled,
      },
      backup: {
        backupRetentionDays: 7,
        geoRedundantBackup: postgres.GeoRedundantBackup.Disabled,
      },
      highAvailability: {
        mode: postgres.PostgreSqlFlexibleServerHighAvailabilityMode.Disabled,
      },
      network: {
        publicNetworkAccess: postgres.ServerPublicNetworkAccessState.Enabled,
      },
      administratorLogin: LOGIN,
      administratorLoginPassword: password.result,
      createMode: postgres.CreateMode.Default,
    },
    { protect: true }
  )
  const database = new postgres.Database(
    'database-name',
    {
      resourceGroupName,
      serverName: server.name,
      databaseName: 'resume_ranker',
      charset: 'UTF8',
      collation: 'en_US.utf8',
    },
    { protect: true }
  )
  new postgres.FirewallRule('database-from-azure', {
    resourceGroupName,
    serverName: server.name,
    firewallRuleName: 'allow-azure-services',
    startIpAddress: '0.0.0.0',
    endIpAddress: '0.0.0.0',
  })
  const url = pulumi.secret(
    pulumi.interpolate`postgres://${LOGIN}:${password.result}@${server.fullyQualifiedDomainName}:5432/${database.name}?sslmode=require`
  )
  return { url, host: server.fullyQualifiedDomainName }
}
