import { z } from 'zod';

/** SPEC-041: token do Cloudflare Turnstile (a documentação limita a 2048 caracteres). */
export const captchaTokenSchema = z.string().trim().min(1).max(2048);

/** Códigos de erro do captcha devolvidos pela API (400). */
export const CAPTCHA_ERROR_CODES = ['CAPTCHA_REQUIRED', 'CAPTCHA_FAILED'] as const;
export type CaptchaErrorCode = (typeof CAPTCHA_ERROR_CODES)[number];
