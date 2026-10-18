import { PATH_METADATA } from '@nestjs/common/constants';
import { GoogleSheetsController } from './google-sheets.controller';

describe('GoogleSheetsController routing', () => {
  it('uses a sync path that cannot be captured as a generic integration id', () => {
    const path = Reflect.getMetadata(
      PATH_METADATA,
      GoogleSheetsController.prototype.syncNow,
    );

    expect(path).toBe('sync-now');
  });
});
