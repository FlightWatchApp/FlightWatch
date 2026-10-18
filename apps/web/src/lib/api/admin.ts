import type {
  CreateInviteResponse,
  ListAdminUsersResponse,
  ListInvitesResponse,
  RevokeInviteResponse,
  UpdateAdminUserRequest,
  UpdateAdminUserResponse,
} from '@flight-watch/contracts';
import { apiFetch } from './client';

/** SPEC-043: tudo aqui responde 404 para quem não é admin (a API é a barreira real). */
export function listInvites(params: {
  state?: string | undefined;
  cursor?: string | undefined;
}): Promise<ListInvitesResponse> {
  const query = new URLSearchParams({ limit: '25' });
  if (params.state) query.set('state', params.state);
  if (params.cursor) query.set('cursor', params.cursor);
  return apiFetch<ListInvitesResponse>(`/v1/admin/invites?${query}`);
}

export function createInvite(email: string, ttlDays?: number): Promise<CreateInviteResponse> {
  return apiFetch<CreateInviteResponse>('/v1/admin/invites', {
    method: 'POST',
    body: JSON.stringify({ email, ...(ttlDays ? { ttlDays } : {}) }),
  });
}

export function revokeInvite(id: string): Promise<RevokeInviteResponse> {
  return apiFetch<RevokeInviteResponse>(`/v1/admin/invites/${id}/revoke`, { method: 'POST' });
}

export function resendInvite(id: string): Promise<CreateInviteResponse> {
  return apiFetch<CreateInviteResponse>(`/v1/admin/invites/${id}/resend`, { method: 'POST' });
}

export function listAdminUsers(cursor?: string): Promise<ListAdminUsersResponse> {
  const query = new URLSearchParams({ limit: '25' });
  if (cursor) query.set('cursor', cursor);
  return apiFetch<ListAdminUsersResponse>(`/v1/admin/users?${query}`);
}

export function updateAdminUser(
  id: string,
  patch: UpdateAdminUserRequest,
): Promise<UpdateAdminUserResponse> {
  return apiFetch<UpdateAdminUserResponse>(`/v1/admin/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}
