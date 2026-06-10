import { createTransport } from 'nodemailer';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MailChannelsTransport } from './mailchannels';

describe('MailChannelsTransport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('does not apply instance DKIM settings to custom transports by default', async () => {
    vi.stubEnv('NEXT_PRIVATE_MAILCHANNELS_DKIM_DOMAIN', 'system.example.com');
    vi.stubEnv('NEXT_PRIVATE_MAILCHANNELS_DKIM_SELECTOR', 'system');
    vi.stubEnv('NEXT_PRIVATE_MAILCHANNELS_DKIM_PRIVATE_KEY', 'private-key');

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const transporter = createTransport(
      MailChannelsTransport.makeTransport({
        endpoint: 'https://mailchannels.example.test/send',
      }),
    );

    await transporter.sendMail({
      from: 'Billing <billing@customer.example.com>',
      to: 'recipient@example.com',
      subject: 'Test',
      text: 'Test',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(body.personalizations[0]).not.toHaveProperty('dkim_domain');
    expect(body.personalizations[0]).not.toHaveProperty('dkim_selector');
    expect(body.personalizations[0]).not.toHaveProperty('dkim_private_key');
  });
});
