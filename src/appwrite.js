import { Client, Account, Databases, Teams } from 'appwrite'

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT
const project = import.meta.env.VITE_APPWRITE_PROJECT_ID

if (!endpoint || !project) {
  // eslint-disable-next-line no-console
  console.error('Missing Appwrite env vars. Copy .env.example to .env, fill in endpoint + project id, then restart `npm run dev`.')
}

export const client = new Client().setEndpoint(endpoint || 'https://cloud.appwrite.io/v1').setProject(project || '')
export const account = new Account(client)
export const databases = new Databases(client)
export const teams = new Teams(client)

export const DB = import.meta.env.VITE_APPWRITE_DB_ID || 'splitit'
export const C = {
  groups: 'groups', expenses: 'expenses', splits: 'splits',
  settlements: 'settlements', messages: 'messages', activity: 'activity', comments: 'comments',
}
