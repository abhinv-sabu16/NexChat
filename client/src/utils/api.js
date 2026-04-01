/**
 * utils/api.js
 *
 * Centralised API layer for all server communication.
 *
 * REST  → auth endpoints, file upload/download
 * GQL   → rooms, messages, user data
 *
 * Access token is stored in memory only (never localStorage).
 * Refresh token lives in an HTTP-only cookie — handled transparently here.
 * On any 401, the client silently refreshes the token and retries once.
 */

const BASE_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:4000';
const GQL_URL  = `${BASE_URL}/graphql`;

// ─── In-memory token store ────────────────────────────────────────────────────
// Access token lives only in memory — survives page navigation but not hard reload.
// Hard reload forces a /api/auth/refresh call (using the HTTP-only cookie).

let _accessToken = null;

export function setAccessToken(token) { _accessToken = token; }
export function getAccessToken()      { return _accessToken;  }
export function clearAccessToken()    { _accessToken = null;  }

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

/**
 * Wraps fetch with:
 *   - Authorization header injection
 *   - Automatic token refresh on 401 (one retry)
 *   - JSON error normalisation
 *
 * @param {string}  url
 * @param {object}  [options] - Standard fetch options
 * @param {boolean} [retry]   - Internal flag to prevent infinite refresh loops
 */
async function apiFetch(url, options = {}, retry = true) {
  const headers = {
    ...options.headers,
    ..._accessToken && { Authorization: `Bearer ${_accessToken}` },
  };

  const res = await fetch(url, { ...options, headers, credentials: 'include' });

  // Transparent token refresh on 401
  if (res.status === 401 && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiFetch(url, options, false); // retry once with new token
    }
    // Refresh failed — clear token and let caller handle
    clearAccessToken();
    throw new ApiError('Session expired. Please log in again.', 401);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status, body.code);
  }

  // 204 No Content
  if (res.status === 204) return null;

  return res.json();
}

// ─── Error class ─────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name   = 'ApiError';
    this.status = status;
    this.code   = code;
  }
}

// ─── Auth endpoints ───────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Sends the ECDH public key at registration so E2EE works immediately.
 */
export async function register({ username, email, password, publicKey }) {
  const data = await apiFetch(`${BASE_URL}/api/auth/register`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ username, email, password, publicKey }),
  });
  setAccessToken(data.accessToken);
  return data.user;
}

/**
 * POST /api/auth/login
 */
export async function login({ email, password }) {
  const data = await apiFetch(`${BASE_URL}/api/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password }),
  });
  setAccessToken(data.accessToken);
  return data.user;
}

/**
 * POST /api/auth/refresh
 * Uses the HTTP-only cookie. Called automatically on 401 and on app boot.
 * Returns true if successful.
 */
export async function refreshAccessToken() {
  try {
    const data = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method:      'POST',
      credentials: 'include',
    });
    if (!data.ok) return false;
    const json = await data.json();
    setAccessToken(json.accessToken);
    return true;
  } catch {
    return false;
  }
}

/**
 * POST /api/auth/logout
 */
/**
 * PUT /api/auth/publicKey
 * Uploads the ECDH public key for the authenticated user.
 * Called after login when the server record has publicKey: null.
 */
export async function uploadPublicKey(publicKey) {
  await apiFetch(`${BASE_URL}/api/auth/publicKey`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ publicKey }),
  });
}

export async function logout() {
  await apiFetch(`${BASE_URL}/api/auth/logout`, { method: 'POST' });
  clearAccessToken();
}

// ─── File endpoints ───────────────────────────────────────────────────────────

/**
 * POST /api/files/upload
 * Uploads a pre-encrypted file blob with its encrypted key.
 *
 * @param {{ encryptedBlob, encryptedFileKey, originalName, mimeType, roomId }} params
 * @returns {Promise<object>} File metadata document
 */
export async function uploadEncryptedFile({ encryptedBlob, encryptedFileKey, originalName, mimeType, roomId }) {
  const form = new FormData();
  form.append('file',             encryptedBlob, originalName);
  form.append('roomId',           roomId);
  form.append('encryptedFileKey', encryptedFileKey);
  form.append('originalName',     originalName);
  form.append('mimeType',         mimeType);

  const data = await apiFetch(`${BASE_URL}/api/files/upload`, {
    method: 'POST',
    body:   form,
    // No Content-Type header — browser sets multipart boundary automatically
  });
  return data.file;
}

/**
 * GET /api/files/:fileId/url
 * Returns a 60-second pre-signed S3 URL plus the encrypted file key.
 */
export async function getFileDownloadUrl(fileId) {
  return apiFetch(`${BASE_URL}/api/files/${fileId}/url`);
}

// ─── GraphQL client ───────────────────────────────────────────────────────────

/**
 * Executes a GraphQL query or mutation.
 *
 * @param {string} query      - GraphQL document string
 * @param {object} [variables]
 * @returns {Promise<object>} data field from response
 */
export async function gql(query, variables = {}) {
  const res = await apiFetch(GQL_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ query, variables }),
  });

  if (res.errors?.length) {
    const first = res.errors[0];
    throw new ApiError(first.message, 400, first.extensions?.code);
  }

  return res.data;
}

// ─── GraphQL queries ──────────────────────────────────────────────────────────

export const QUERIES = {
  ME: /* GraphQL */ `
    query Me {
      me { id username publicKey presence }
    }
  `,

  ROOMS: /* GraphQL */ `
    query Rooms {
      rooms {
        id name description type createdAt
        members { id username publicKey presence }
        createdBy { id username }
      }
    }
  `,

  ROOM: /* GraphQL */ `
    query Room($id: ID!, $limit: Int, $before: String) {
      room(id: $id) {
        id name description type createdAt
        members { id username publicKey presence }
        createdBy { id username }
        messages(limit: $limit, before: $before) {
          id content createdAt
          sender { id username publicKey }
          file {
            id originalName mimeType sizeBytes s3Key encryptedFileKey
          }
          readBy { id username }
        }
      }
    }
  `,

  USER: /* GraphQL */ `
    query User($id: ID!) {
      user(id: $id) { id username publicKey presence }
    }
  `,
  SEARCH_USERS: /* GraphQL */ `
    query SearchUsers($query: String!) {
      searchUsers(query: $query) { id username publicKey presence }
    }
  `,
};

// ─── GraphQL mutations ────────────────────────────────────────────────────────

export const MUTATIONS = {
  CREATE_ROOM: /* GraphQL */ `
    mutation CreateRoom($name: String!, $description: String, $type: RoomType) {
      createRoom(name: $name, description: $description, type: $type) {
        id name description type createdAt
        members { id username publicKey presence }
        createdBy { id username }
      }
    }
  `,

  ADD_MEMBER: /* GraphQL */ `
    mutation AddMember($roomId: ID!, $userId: ID!) {
      addMember(roomId: $roomId, userId: $userId) {
        id members { id username publicKey presence }
      }
    }
  `,

  LEAVE_ROOM: /* GraphQL */ `
    mutation LeaveRoom($roomId: ID!) {
      leaveRoom(roomId: $roomId)
    }
  `,
};