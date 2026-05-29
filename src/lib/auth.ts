import { NextRequest } from 'next/server'
import { getSessionAsync } from './sessions'

/**
 * Extracts and validates the Bearer token from the request Authorization header.
 * Returns the session user if valid, or null if invalid/missing.
 */
export async function verifyAuth(
  request: NextRequest
): Promise<{ id: string; email: string; name: string; role: string } | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.slice(7) // Remove "Bearer " prefix
  if (!token) {
    return null
  }

  const session = await getSessionAsync(token)
  if (!session) {
    return null
  }

  return {
    id: session.id,
    email: session.email,
    name: session.name,
    role: session.role,
  }
}