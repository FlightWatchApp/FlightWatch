import { Injectable, type PipeTransform } from '@nestjs/common';
import { type DeleteAccountRequest, deleteAccountRequestSchema } from '@flight-watch/contracts';
import { parseAuthInput } from './parse-auth-input.js';

/** SPEC-027. */
@Injectable()
export class DeleteAccountValidationPipe implements PipeTransform<unknown, DeleteAccountRequest> {
  transform(value: unknown): DeleteAccountRequest {
    return parseAuthInput(deleteAccountRequestSchema, value, 'invalid delete account input');
  }
}
