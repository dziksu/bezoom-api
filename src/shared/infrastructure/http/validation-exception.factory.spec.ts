import { validationExceptionFactory } from './validation-exception.factory';

describe('validationExceptionFactory', () => {
  it('creates stable field-level validation keys without validator messages', () => {
    const exception = validationExceptionFactory([
      {
        property: 'title',
        value: '',
        constraints: {
          minLength: 'title must be longer than or equal to 3 characters',
          isString: 'title must be a string'
        },
        children: []
      }
    ]);

    expect(exception.getResponse()).toEqual({
      code: 'VALIDATION_FAILED',
      fields: {
        title: [{ code: 'VALIDATION_MIN_LENGTH' }, { code: 'VALIDATION_IS_STRING' }]
      }
    });
  });

  it('uses dotted paths for nested properties', () => {
    const exception = validationExceptionFactory([
      {
        property: 'location',
        children: [
          {
            property: 'latitude',
            constraints: { isNumber: 'latitude must be a number' },
            children: []
          }
        ]
      }
    ]);

    expect(exception.getResponse()).toEqual({
      code: 'VALIDATION_FAILED',
      fields: {
        'location.latitude': [{ code: 'VALIDATION_IS_NUMBER' }]
      }
    });
  });
});
