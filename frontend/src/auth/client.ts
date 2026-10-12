export interface User {
  id: number
  name: string
  email: string
  primary_currency: string
  is_verified?: boolean
}

export interface RegisterResult extends User {
  verification_emailed: boolean
}

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

// Generous timeout: the free-tier backend sleeps when idle and can take
// ~a minute to wake. Without this, phones on slow data hang forever.
const API_TIMEOUT_MS = 75000

function base(): string {
  return API_BASE.replace(/\/$/, '')
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), API_TIMEOUT_MS)
  try {
    return await fetch(`${base()}${path}`, {
      ...init,
      signal: ctrl.signal,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('The server is taking too long (it may be waking up). Please try again.')
    }
    throw new Error('Network error. Check your connection and try again.')
  } finally {
    window.clearTimeout(timer)
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json()
    if (typeof data?.detail === 'string') return data.detail
    if (Array.isArray(data?.detail)) {
      const first = data.detail[0]
      if (typeof first?.msg === 'string') return first.msg
    }
    return `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}

export async function getMe(): Promise<User | null> {
  const res = await apiFetch('/auth/me')
  if (res.status === 401) return null
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as User
}

export async function register(name: string, email: string, password: string): Promise<RegisterResult> {
  const res = await apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as RegisterResult
}

export async function login(email: string, password: string): Promise<User> {
  const res = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as User
}

export async function logout(): Promise<void> {
  await apiFetch('/auth/logout', { method: 'POST' })
}

export async function updateMe(data: { name?: string; primary_currency?: string }): Promise<User> {
  const res = await apiFetch('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as User
}

export const MVP_CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP'] as const
