import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateAndDispositionDto, DispositionDto } from './dto/disposition.dto';

/**
 * clientRequestId is an idempotency key, not a credential: it only has to be
 * unique per attempt. Declaring it @IsUUID() meant every disposition from the
 * phone was rejected with 400 — React Native has no crypto.randomUUID, so the
 * app mints "disp-<ms>-<random>" and always will. The feature shipped to
 * TestFlight and recorded nothing.
 */
async function errorsFor(value: unknown, dto: any = DispositionDto) {
  const instance = plainToInstance(dto, {
    outcome: 'successful',
    contactId: '6f0f2e6c-1b3a-4a1f-9f2e-0e6f1a2b3c4d',
    clientRequestId: value,
  });
  const errors = await validate(instance as any);
  return errors.filter((e) => e.property === 'clientRequestId');
}

describe('clientRequestId', () => {
  it('accepts what the phone actually sends', async () => {
    expect(await errorsFor('disp-1792260000000-a1b2c3d4')).toHaveLength(0);
    expect(await errorsFor('move-1792260000000-a1b2c3')).toHaveLength(0);
  });

  it('accepts a real UUID, which is what the web sends', async () => {
    expect(await errorsFor('6f0f2e6c-1b3a-4a1f-9f2e-0e6f1a2b3c4d')).toHaveLength(0);
  });

  it('rejects something too short to be unique per attempt', async () => {
    expect((await errorsFor('x')).length).toBeGreaterThan(0);
    expect((await errorsFor('')).length).toBeGreaterThan(0);
  });

  it('rejects an absurdly long value, which would bloat every activity row', async () => {
    expect((await errorsFor('a'.repeat(200))).length).toBeGreaterThan(0);
  });

  // It is stored in metadata and compared as a string; anything exotic in it
  // is a problem waiting to happen rather than a useful key.
  it('rejects characters that do not belong in an id', async () => {
    for (const bad of ['disp 1792 a', 'disp/../../etc', '<script>alert(1)</script>', 'disp;drop']) {
      expect((await errorsFor(bad)).length).toBeGreaterThan(0);
    }
  });

  it('applies the same rule to the create-and-disposition body', async () => {
    expect(await errorsFor('disp-1792260000000-a1b2c3d4', CreateAndDispositionDto)).toHaveLength(0);
  });
});
