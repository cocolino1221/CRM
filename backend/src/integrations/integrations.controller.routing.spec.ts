import { PATH_METADATA } from '@nestjs/common/constants';
import { IntegrationsController } from './integrations.controller';

describe('IntegrationsController routing', () => {
  it('declares the legacy Google Sheets sync path explicitly', () => {
    const googleSheetsPath = Reflect.getMetadata(
      PATH_METADATA,
      IntegrationsController.prototype.syncGoogleSheets,
    );
    const genericSyncPath = Reflect.getMetadata(
      PATH_METADATA,
      IntegrationsController.prototype.sync,
    );

    expect(googleSheetsPath).toBe('google-sheets/sync');
    expect(genericSyncPath).toBe(':id/sync');
  });
});
