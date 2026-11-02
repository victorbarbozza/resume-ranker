import * as storage from '@pulumi/azure-native/storage'
import type * as pulumi from '@pulumi/pulumi'

/** Where the app keeps uploaded resumes, and the key it reads them with */
export type Files = {
  accountName: pulumi.Output<string>
  containerName: pulumi.Output<string>
  key: pulumi.Output<string>
}

/** A storage account with a private `resumes` container, reachable only over HTTPS with TLS 1.2; both are protected, so Pulumi refuses to delete or replace them */
export const createFiles = (
  resourceGroupName: pulumi.Input<string>,
  accountName: pulumi.Input<string>
): Files => {
  const account = new storage.StorageAccount(
    'files',
    {
      resourceGroupName,
      accountName,
      kind: storage.Kind.StorageV2,
      sku: { name: storage.SkuName.Standard_LRS },
      accessTier: storage.AccessTier.Hot,
      allowBlobPublicAccess: false,
      minimumTlsVersion: storage.MinimumTlsVersion.TLS1_2,
      enableHttpsTrafficOnly: true,
    },
    { protect: true }
  )
  const container = new storage.BlobContainer(
    'resumes',
    {
      resourceGroupName,
      accountName: account.name,
      containerName: 'resumes',
      publicAccess: storage.PublicAccess.None,
    },
    { protect: true }
  )
  const key = storage
    .listStorageAccountKeysOutput({
      resourceGroupName,
      accountName: account.name,
    })
    .apply((result) => result.keys[0].value)
  return { accountName: account.name, containerName: container.name, key }
}
