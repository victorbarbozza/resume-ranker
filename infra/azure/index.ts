import * as resources from '@pulumi/azure-native/resources'

import { createBudget } from './resources/budget'
import { createContainers } from './resources/containers'
import { createDatabase } from './resources/database'
import { createFiles } from './resources/files'
import { createLlm } from './resources/llm'
import { createNames } from './resources/names'
import { readSettings } from './resources/settings'

/**
 * Resume Ranker on Azure: one resource group with the app's storage, its
 * database, its model, and the containers that run it, plus a budget alert
 * on the subscription. Each piece lives in its own file under resources/.
 */
const settings = readSettings()
const names = createNames()

const group = new resources.ResourceGroup('group', {
  resourceGroupName: names.resourceGroup,
})

const files = createFiles(group.name, names.storageAccount)
const database = createDatabase(group.name, names.databaseServer)
const llm = createLlm(group.name, names.openaiAccount, settings)
const containers = createContainers({
  resourceGroupName: group.name,
  names,
  image: settings.image,
  database,
  files,
  llm,
})

if (settings.budgetEmail) createBudget(settings, settings.budgetEmail)

export const resourceGroup = group.name
export const appName = containers.appName
export const migrateJobName = containers.migrateJobName
export const url = containers.url
export const databaseHost = database.host
export const openaiAccount = llm.resourceName
