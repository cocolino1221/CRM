import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SaveMetaCapiConfigDto } from './save-meta-capi-config.dto';

const errorsFor = (body: unknown) =>
  validateSync(plainToInstance(SaveMetaCapiConfigDto, body as any), { whitelist: true })
    .flatMap(error => Object.values(error.constraints ?? {}));

describe('SaveMetaCapiConfigDto', () => {
  it('accepts a dataset id with a token', () => {
    expect(errorsFor({ datasetId: '975950368711042', accessToken: 'EAAabc', enabled: true })).toEqual([]);
  });

  it('accepts a body with no token, which keeps the stored one', () => {
    expect(errorsFor({ datasetId: '975950368711042', enabled: false })).toEqual([]);
  });

  it('requires the dataset id', () => {
    expect(errorsFor({ accessToken: 'EAAabc' })).toContain('Dataset ID is required.');
  });

  it('rejects a non-string token instead of storing whatever came in', () => {
    expect(errorsFor({ datasetId: '975950368711042', accessToken: { nested: 'object' } })).not.toEqual([]);
  });

  it('rejects a body whose toggle is not a boolean', () => {
    expect(errorsFor({ datasetId: '975950368711042', enabled: 'maybe' })).not.toEqual([]);
  });

  // The readable "that is 2698 characters long" message comes from
  // meta-access-token.ts; this bound only stops an absurd payload.
  it('caps the token at something no real token approaches', () => {
    expect(errorsFor({ datasetId: '1', accessToken: 'E'.repeat(9000) })).not.toEqual([]);
    expect(errorsFor({ datasetId: '1', accessToken: 'E'.repeat(2698) })).toEqual([]);
  });
});
