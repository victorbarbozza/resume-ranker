import { createBudget } from './resources/budget'
import { createContainers } from './resources/containers'
import { createDatabase } from './resources/database'
import { createFiles } from './resources/files'
import { createLlm } from './resources/llm'
import { createNames } from './resources/names'
import { readSettings } from './resources/settings'

/**
 * Resume Ranker on Azure: the app's storage, its database, its model, the
 * containers that run it and a budget alert, all in one resource group.
 * bootstrap.sh creates the group, so the deploy may touch nothing outside it.
 * Each piece lives in its own file under resources/.
 */
const settings = readSettings()
const names = createNames()
const group = names.resourceGroup

const files = createFiles(group, names.storageAccount)
const database = createDatabase(group, names.databaseServer)
const llm = createLlm(group, names.openaiAccount, settings)
const containers = createContainers({
  resourceGroupName: group,
  names,
  image: settings.image,
  database,
  files,
  llm,
})

if (settings.budgetEmail) createBudget(group, settings, settings.budgetEmail)

export const resourceGroup = group
export const appName = containers.appName
export const migrateJobName = containers.migrateJobName
export const url = containers.url
export const databaseHost = database.host
export const openaiAccount = llm.resourceName
