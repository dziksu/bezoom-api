import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReportEventDto } from './safety.dto';

describe('ReportEventDto', () => {
  it('accepts a reason and trims the optional description', async () => {
    const dto = plainToInstance(ReportEventDto, { reason: 'FRAUD', description: '  fake tickets  ' });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.description).toBe('fake tickets');
  });

  it.each([
    { reason: 'UNKNOWN' },
    { reason: 'SPAM', description: '' },
    { reason: 'SPAM', description: 'x'.repeat(1001) }
  ])('rejects an invalid report: %o', async (payload) => {
    const dto = plainToInstance(ReportEventDto, payload);
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
