/**
 * lib/validators.js
 *
 * Zod schemas for all input validation.
 *
 * Why Zod at the boundary (not just service-level checks):
 *   - Catches bad input before it hits the DB layer
 *   - Gives the client field-level error messages
 *   - Services can trust their inputs are already shaped correctly
 *
 * Pattern:
 *   const parsed = validate(schema, rawInput);  // throws ValidationError on failure
 *   service(parsed);                            // service receives clean data
 */

import { z } from 'zod';
import { ValidationError } from './errors.js';

// ─── Core helper ──────────────────────────────────────────────────────────────

/**
 * Runs a Zod schema against raw input.
 * On failure, collects all field errors into a single ValidationError message.
 *
 * @template T
 * @param {z.ZodType<T>} schema
 * @param {unknown}       input
 * @returns {T} Parsed, type-safe value
 * @throws {ValidationError}
 */
export function validate(schema, input) {
  const result = schema.safeParse(input);

  if (!result.success) {
    // Flatten Zod issues into "field: message" strings
    const messages = result.error.issues.map(
      (issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`
    );
    throw new ValidationError(messages.join(' | '));
  }

  return result.data;
}

// ─── Auth schemas ─────────────────────────────────────────────────────────────

export const RegisterSchema = z.object({
  username:  z.string().trim().min(2, 'At least 2 characters').max(32, 'At most 32 characters'),
  email:     z.string().trim().email('Must be a valid email address'),
  password:  z.string().min(8, 'At least 8 characters'),
  publicKey: z.string().optional().nullable(),
});

export const LoginSchema = z.object({
  email:    z.string().trim().email('Must be a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

// ─── Message schemas ──────────────────────────────────────────────────────────

/**
 * Socket.io message:send payload.
 * `content` is opaque ciphertext — we only validate it is a non-empty string.
 */
export const SendMessageSchema = z.object({
  roomId:  z.string().trim().min(1, 'roomId is required'),
  content: z.string().trim().min(1, 'content cannot be empty'),
  fileId:  z.string().trim().optional().nullable(),
});

// ─── Room schemas ─────────────────────────────────────────────────────────────

export const JoinRoomSchema = z.object({
  roomId: z.string().trim().min(1, 'roomId is required'),
});

// ─── File schemas ─────────────────────────────────────────────────────────────

export const FileUploadSchema = z.object({
  roomId:           z.string().trim().min(1, 'roomId is required'),
  encryptedFileKey: z.string().trim().min(1, 'encryptedFileKey is required'),
  originalName:     z.string().trim().min(1, 'originalName is required').max(255),
  mimeType:         z.string().trim().min(1, 'mimeType is required'),
});

// ─── GraphQL argument schemas ─────────────────────────────────────────────────

export const RoomMessagesArgsSchema = z.object({
  // GraphQL passes Int which arrives as a JS number; coerce to be safe
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  // before is an ISO string from createdAt.toISOString() — allow null/undefined
  before: z
    .string()
    .datetime({ offset: true, message: 'before must be a valid ISO 8601 date-time' })
    .optional()
    .nullable(),
});

export const IdArgSchema = z.object({
  id: z.string().trim().min(1, 'id is required'),
});