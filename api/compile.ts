import type { VercelRequest, VercelResponse } from '@vercel/node'

const ALLOWED_COMPILERS = new Set(['carm1121', 'armug1320', 'armug1430', 'x86-64g1420'])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { compilerId, source, options } = (req.body ?? {}) as {
    compilerId?: string
    source?: string
    options?: { userArguments?: string }
  }

  if (!compilerId || !ALLOWED_COMPILERS.has(compilerId)) {
    return res.status(400).json({ error: `unknown compiler: ${compilerId}` })
  }
  if (typeof source !== 'string' || source.trim() === '') {
    return res.status(400).json({ error: 'source is required' })
  }

  const upstream = await fetch(
    `https://godbolt.org/api/compiler/${compilerId}/compile`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ source, options: { userArguments: options?.userArguments ?? '' } }),
    },
  )

  const data: unknown = await upstream.json()
  return res.status(upstream.status).json(data)
}
