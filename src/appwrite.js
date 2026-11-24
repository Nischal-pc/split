import { Client, Account, Databases, Teams, Functions } from 'appwrite'

// Public defaults so a plain `vercel build` works without env vars set.
// Project id + endpoint are public (they ship in the client bundle); access is
// gated by Appwrite's platform allowlist + auth, not by hiding these. Env vars override.
const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://tor.cloud.appwrite.io/v1'
const project = import.meta.env.VITE_APPWRITE_PROJECT_ID || '6b04f8100011b3a5a776'

export const client = new Client().setEndpoint(endpoint).setProject(project)
export const account = new Account(client)
export const databases = new Databases(client)
export const teams = new Teams(client)
export const functions = new Functions(client)

export const DB = import.meta.env.VITE_APPWRITE_DB_ID || 'splitit'
export const C = {
  groups: 'groups', expenses: 'expenses', splits: 'splits',
  settlements: 'settlements', messages: 'messages', activity: 'activity', comments: 'comments',
}
