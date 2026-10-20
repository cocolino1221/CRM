import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateContactDto } from './create-contact.dto';
import { normalizeContactSource } from './contact-source.util';

async function errorsFor(source: unknown) {
  const dto = plainToInstance(CreateContactDto, { firstName: 'Iris', lastName: 'Simon', source });
  const errors = await validate(dto);
  return { dto, sourceErrors: errors.filter((e) => e.property === 'source') };
}

describe('contact source from the app', () => {
  it.each([
    ['Social Media', 'social_media'],
    ['Cold Call', 'cold_outreach'],
    ['Website', 'website'],
    ['Typeform', 'typeform'],
    ['WhatsApp', 'whatsapp'],
    ['Other', 'other'],
    ['woocommerce', 'woocommerce'],
  ])('accepts the chip "%s" as %s', async (label, value) => {
    const { dto, sourceErrors } = await errorsFor(label);
    expect(sourceErrors).toHaveLength(0);
    expect(dto.source).toBe(value);
  });

  it('still rejects a source that means nothing', async () => {
    const { sourceErrors } = await errorsFor('Carrier pigeon');
    expect(sourceErrors).toHaveLength(1);
  });

  it('treats an empty source as none', () => {
    expect(normalizeContactSource('  ')).toBeUndefined();
  });
});
