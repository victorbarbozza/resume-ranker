import * as app from '@pulumi/azure-native/app'
import type * as pulumi from '@pulumi/pulumi'

/**
 * A custom domain for the app.
 *
 * - `name`: the hostname, such as `ranker.example.dev`, with a CNAME to the app's address and the `asuid` TXT record in its DNS
 * - `certificate`: the name of its managed certificate in the environment
 */
export type Domain = { name: string; certificate: string }

/** Where the certificate lives */
export type DomainInput = {
  resourceGroupName: string
  environmentName: string
  environment: pulumi.Resource
  domain: Domain
}

/**
 * The free certificate Container Apps issues and renews for the domain,
 * validated by its CNAME. A certificate made before the stack knew it is
 * imported once, when the subscription is known, instead of issued again.
 */
export const createDomainCertificate = ({
  resourceGroupName,
  environmentName,
  environment,
  domain,
}: DomainInput): pulumi.Output<string> => {
  const subscription = process.env.ARM_SUBSCRIPTION_ID
  const existing = subscription
    ? `/subscriptions/${subscription}/resourceGroups/${resourceGroupName}/providers/Microsoft.App/managedEnvironments/${environmentName}/managedCertificates/${domain.certificate}`
    : undefined
  const certificate = new app.ManagedCertificate(
    'domain-certificate',
    {
      resourceGroupName,
      environmentName,
      managedCertificateName: domain.certificate,
      properties: {
        subjectName: domain.name,
        domainControlValidation:
          app.ManagedCertificateDomainControlValidation.CNAME,
      },
    },
    { parent: environment, import: existing }
  )
  return certificate.id
}
