import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data')

export async function readCollection(name, fallback = []) {
  await mkdir(directory, { recursive: true })
  const file = path.join(directory, `${name}.json`)
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    await writeCollection(name, fallback)
    return fallback
  }
}

export async function writeCollection(name, records) {
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, `${name}.json`), `${JSON.stringify(records, null, 2)}\n`, 'utf8')
}