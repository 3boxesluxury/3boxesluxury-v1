// Re-export everything from auth.ts (single source of truth)
export {
  authenticate,
  requireAdmin,
  requirePermission,
  getSessionFromRequest,
  generateJWT,
  getClientIp,
  getUserAgent,
  parseDeviceInfo,
} from './auth'

export type { AuthUser } from './auth'

// Also export sessions for backward compatibility
export { sessions } from './sessions'
export type { SessionUser } from './sessions'