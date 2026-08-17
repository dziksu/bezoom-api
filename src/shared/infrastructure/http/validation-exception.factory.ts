import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import type { ApiFieldError } from './api-error';

const CONSTRAINT_CODES: Record<string, string> = {
  arrayMaxSize: 'VALIDATION_ARRAY_MAX_SIZE',
  isArray: 'VALIDATION_IS_ARRAY',
  isBoolean: 'VALIDATION_IS_BOOLEAN',
  isEmail: 'VALIDATION_IS_EMAIL',
  isEnum: 'VALIDATION_IS_ENUM',
  isInt: 'VALIDATION_IS_INTEGER',
  isISO31661Alpha2: 'VALIDATION_IS_COUNTRY_CODE',
  isISO4217CurrencyCode: 'VALIDATION_IS_CURRENCY_CODE',
  isNotEmpty: 'VALIDATION_REQUIRED',
  isNumber: 'VALIDATION_IS_NUMBER',
  isPhoneNumber: 'VALIDATION_IS_PHONE_NUMBER',
  isString: 'VALIDATION_IS_STRING',
  isTimeZone: 'VALIDATION_IS_TIME_ZONE',
  isUrl: 'VALIDATION_IS_URL',
  matches: 'VALIDATION_INVALID_FORMAT',
  max: 'VALIDATION_MAX',
  maxLength: 'VALIDATION_MAX_LENGTH',
  min: 'VALIDATION_MIN',
  minLength: 'VALIDATION_MIN_LENGTH',
  whitelistValidation: 'VALIDATION_FIELD_NOT_ALLOWED'
};

function flattenErrors(errors: ValidationError[], prefix = ''): Record<string, ApiFieldError[]> {
  return errors.reduce<Record<string, ApiFieldError[]>>((fields, error) => {
    const path = prefix ? `${prefix}.${error.property}` : error.property;
    const constraintNames = Object.keys(error.constraints ?? {});

    if (constraintNames.length > 0) {
      fields[path] = constraintNames.map((constraint) => ({
        code: CONSTRAINT_CODES[constraint] ?? 'VALIDATION_INVALID_VALUE'
      }));
    }

    Object.assign(fields, flattenErrors(error.children ?? [], path));
    return fields;
  }, {});
}

export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    fields: flattenErrors(errors)
  });
}
