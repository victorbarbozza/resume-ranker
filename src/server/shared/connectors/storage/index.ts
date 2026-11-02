import { createStorage, type Driver, type Storage } from 'unstorage'

import { storageDir, storageDriver } from '@/server/config/env'

/** Every place uploaded files can live, by the name STORAGE_DRIVER takes */
export const STORAGE_DRIVER_NAMES = ['fs', 'azure', 's3'] as const
/** One of STORAGE_DRIVER_NAMES */
export type StorageDriverName = (typeof STORAGE_DRIVER_NAMES)[number]

/** A variable a driver needs; throws an error that names it when it is not set */
const required = (driver: StorageDriverName, name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`STORAGE_DRIVER=${driver} needs ${name}`)
  return value
}

/**
 * How to reach each place. Each driver is imported only when it is picked,
 * so an unused cloud SDK is never loaded; adding a place is an entry here.
 */
const STORAGE_DRIVERS: Record<StorageDriverName, () => Promise<Driver>> = {
  fs: async () => {
    const { default: fsDriver } = await import('unstorage/drivers/fs-lite')
    return fsDriver({ base: storageDir })
  },
  azure: async () => {
    const { default: azureDriver } =
      await import('unstorage/drivers/azure-storage-blob')
    return azureDriver({
      accountName: required('azure', 'AZURE_STORAGE_ACCOUNT'),
      accountKey: required('azure', 'AZURE_STORAGE_KEY'),
      containerName: required('azure', 'AZURE_STORAGE_CONTAINER'),
    })
  },
  s3: async () => {
    const { default: s3Driver } = await import('unstorage/drivers/s3')
    return s3Driver({
      endpoint: required('s3', 'S3_ENDPOINT'),
      region: required('s3', 'S3_REGION'),
      bucket: required('s3', 'S3_BUCKET'),
      accessKeyId: required('s3', 'S3_ACCESS_KEY_ID'),
      secretAccessKey: required('s3', 'S3_SECRET_ACCESS_KEY'),
    })
  },
}

/** The storage of this process, created on first use */
let storage: Promise<Storage> | undefined

/** Creates the storage STORAGE_DRIVER picks; throws an error that names what is wrong */
const createFileStorage = async (): Promise<Storage> => {
  const driver = STORAGE_DRIVER_NAMES.find((name) => name === storageDriver)
  if (!driver) {
    throw new Error(
      `STORAGE_DRIVER must be one of ${STORAGE_DRIVER_NAMES.join(', ')}, not "${storageDriver}"`
    )
  }
  return createStorage({ driver: await STORAGE_DRIVERS[driver]() })
}

/** The file storage of this process; the worker calls it on start, so a wrong variable stops it there */
export const fileStorage = (): Promise<Storage> => {
  storage ??= createFileStorage()
  return storage
}

/** Stores a file under its key; storing the same key again writes the same bytes */
export const putFile = async (key: string, bytes: Uint8Array): Promise<void> =>
  (await fileStorage()).setItemRaw(key, bytes)

/** A stored file, or null when nothing is stored under the key */
export const getFile = async (key: string): Promise<Uint8Array | null> =>
  (await fileStorage()).getItemRaw<Uint8Array>(key)
