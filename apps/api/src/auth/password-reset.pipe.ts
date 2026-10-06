import { Injectable, type PipeTransform } from '@nestjs/common';
import {
  type PasswordResetConfirm,
  type PasswordResetRequest,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from '@flight-watch/contracts';
import { parseAuthInput } from './parse-auth-input.js';

/** SPEC-026. */
@Injectable()
export class PasswordResetRequestValidationPipe implements PipeTransform<
  unknown,
  PasswordResetRequest
> {
  transform(value: unknown): PasswordResetRequest {
    return parseAuthInput(passwordResetRequestSchema, value, 'invalid password reset input');
  }
}

/** SPEC-026. */
@Injectable()
export class PasswordResetConfirmValidationPipe implements PipeTransform<
  unknown,
  PasswordResetConfirm
> {
  transform(value: unknown): PasswordResetConfirm {
    return parseAuthInput(passwordResetConfirmSchema, value, 'invalid password reset input');
  }
}
