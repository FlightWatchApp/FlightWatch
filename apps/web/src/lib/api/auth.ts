import type {
  AuthenticatedUser,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  VerifyEmailResponse,
} from '@flight-watch/contracts';
import { ApiError, apiFetch } from './client';

export async function register(input: RegisterRequest): Promise<RegisterResponse> {
  return apiFetch<RegisterResponse>('/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function login(input: LoginRequest): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function logout(): Promise<void> {
  await apiFetch<undefined>('/v1/auth/logout', { method: 'POST' });
}

/** `null` quando não há sessão válida — chamadores decidem se isso é 401 ou redirecionamento. */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  try {
    return await apiFetch<AuthenticatedUser>('/v1/auth/me');
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export async function verifyEmail(token: string): Promise<VerifyEmailResponse> {
  return apiFetch<VerifyEmailResponse>('/v1/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function resendVerification(): Promise<void> {
  await apiFetch<undefined>('/v1/auth/resend-verification', { method: 'POST' });
}

/** SPEC-026: a API responde 202 exista a conta ou não. */
export async function requestPasswordReset(email: string): Promise<void> {
  await apiFetch<undefined>('/v1/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function confirmPasswordReset(token: string, password: string): Promise<void> {
  await apiFetch<undefined>('/v1/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}
