import * as pulumi from '@pulumi/pulumi'
import * as random from '@pulumi/random'

/** Names of the resources; storage, the database server and Azure OpenAI must be unique in all of Azure, so they end with a suffix */
export type Names = {
  resourceGroup: string
  storageAccount: pulumi.Output<string>
  databaseServer: pulumi.Output<string>
  openaiAccount: pulumi.Output<string>
  environment: string
  app: string
  migrateJob: string
}

/** Draws the suffix once and keeps it in the stack, so the names never change between runs; it is protected, so Pulumi refuses to draw another one */
export const createNames = (): Names => {
  const suffix = new random.RandomString(
    'suffix',
    {
      length: 6,
      special: false,
      upper: false,
    },
    { protect: true }
  ).result
  return {
    resourceGroup: 'rg-resume-ranker',
    storageAccount: pulumi.interpolate`stresumeranker${suffix}`,
    databaseServer: pulumi.interpolate`psql-resume-ranker-${suffix}`,
    openaiAccount: pulumi.interpolate`aoai-resume-ranker-${suffix}`,
    environment: 'cae-resume-ranker',
    app: 'ca-resume-ranker',
    migrateJob: 'caj-resume-ranker-migrate',
  }
}
