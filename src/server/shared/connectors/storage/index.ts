import { createStorage, type Driver, type Storage } from 'unstorage'

import { storageDir, storageDriver } from '@/server/config/env'

/** Every place uploaded files can live, by the name STORAGE_DRIVER takes */
const STORAGE_DRIVER_NAMES = ['fs', 'azure'] as const
/** One of STORAGE_DRIVER_NAMES */
type StorageDriverName = (typeof STORAGE_DRIVER_NAMES)[number]

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
}

/** The storage of this process, created on first use */
let storage: Storage | undefined

/**
 * The file storage STORAGE_DRIVER picks, created on first use. Throws an
 * error that names what is wrong; the worker calls it on start, so a wrong
 * variable stops it there.
 */
export const fileStorage = async (): Promise<Storage> => {
  if (storage) return storage

  const driver = STORAGE_DRIVER_NAMES.find((name) => name === storageDriver)
  if (!driver) {
    throw new Error(
      `STORAGE_DRIVER must be one of ${STORAGE_DRIVER_NAMES.join(', ')}, not "${storageDriver}"`
    )
  }
  storage = createStorage({ driver: await STORAGE_DRIVERS[driver]() })
  return storage
}

/** Stores a file under its key; storing the same key again writes the same bytes */
export const putFile = async (key: string, bytes: Uint8Array): Promise<void> =>
  (await fileStorage()).setItemRaw(key, bytes)

/**
 * A stored file, or null when the storage gives nothing back. Drivers answer
 * with a Buffer or an ArrayBuffer, so the bytes are wrapped as one type; the
 * Azure driver also answers null when it cannot reach the storage.
 */
export const getFile = async (key: string): Promise<Uint8Array | null> => {
  const raw = await (await fileStorage()).getItemRaw(key)
  return raw === null ? null : new Uint8Array(raw)
}
