import * as authorization from '@pulumi/azure-native/authorization'
import * as consumption from '@pulumi/azure-native/consumption'
import * as pulumi from '@pulumi/pulumi'

import type { Settings } from './settings'

/** Percentages of the budget that send an email */
const THRESHOLDS = [50, 80, 100]

/** A monthly budget on the whole subscription that emails at each threshold; it warns, it never stops anything */
export const createBudget = (settings: Settings, email: string) => {
  const subscription = authorization.getClientConfigOutput().subscriptionId
  new consumption.Budget('budget', {
    scope: pulumi.interpolate`/subscriptions/${subscription}`,
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
