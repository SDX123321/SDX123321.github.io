import { useAuthStore } from '../stores/auth'

export function useAuth() {
  const auth = useAuthStore()
  void auth.initialize()
  return auth
}
