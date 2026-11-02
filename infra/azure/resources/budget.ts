import * as consumption from '@pulumi/azure-native/consumption'
import * as resources from '@pulumi/azure-native/resources'

import type { Settings } from './settings'

/** Percentages of the budget that send an email */
const THRESHOLDS = [50, 80, 100]

/**
 * A monthly budget on the app's resource group that emails at each
 * threshold; it warns, it never stops anything. It lives on the group, not
 * the subscription, because the deploy may touch only the group.
 */
export const createBudget = (
  resourceGroupName: string,
  settings: Settings,
  email: string
) => {
  new consumption.Budget('budget', {
    scope: resources.getResourceGroupOutput({ resourceGroupName }).id,
    budgetName: 'resume-ranker',
    amount: settings.budgetAmount,
    category: consumption.CategoryType.Cost,
    timeGrain: consumption.TimeGrainType.Monthly,
    timePeriod: { startDate: settings.budgetStart },
    notifications: Object.fromEntries(
      THRESHOLDS.map((threshold) => [
        `actual${threshold}`,
        {
          enabled: true,
          operator: consumption.OperatorType.GreaterThan,
          threshold,
          thresholdType: consumption.ThresholdType.Actual,
          contactEmails: [email],
        },
      ])
    ),
  })
}
