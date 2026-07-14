function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () =>
      reject(new Error(`IndexedDB database is still open: ${name}`))
  })
}

export async function resetIndexedDb(...databaseNames: string[]): Promise<void> {
  const names =
    databaseNames.length > 0
      ? databaseNames
      : (await indexedDB.databases())
          .map(({ name }) => name)
          .filter((name): name is string => Boolean(name))

  await Promise.all(names.map(deleteDatabase))
}
