import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FieldType } from '@prisma/client';

import { apiSeedPendingDocument } from '../fixtures/api-seeds';

const PDF_PAGE_SELECTOR = 'img[data-page-number]';

const expectNoSeriousAccessibilityViolations = (
  violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations'],
) => {
  const seriousViolations = violations.filter((violation) => {
    return violation.impact === 'serious' || violation.impact === 'critical';
  });

  expect(seriousViolations).toEqual([]);
};

test.describe('Signing accessibility', () => {
  test('V2 signing page has accessible form controls and keyboard field activation', async ({ page, request }) => {
    const { envelope, distributeResult } = await apiSeedPendingDocument(request, {
      title: '[TEST] Accessible Signing Document',
      recipients: [{ email: 'signer-accessibility@test.documenso.com', name: 'Accessible Signer' }],
      fieldsPerRecipient: [
        [{ type: FieldType.SIGNATURE, page: 1, positionX: 10, positionY: 10, width: 18, height: 6 }],
      ],
    });

    const { token } = distributeResult.recipients[0];
    const signatureField = envelope.fields.find((field) => field.type === FieldType.SIGNATURE);

    if (!signatureField) {
      throw new Error('Signature field not found');
    }

    await page.goto(`/sign/${token}`);
    await expect(page.locator(PDF_PAGE_SELECTOR).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.konva-container canvas').first()).toBeVisible({ timeout: 30_000 });

    await expect(page.getByRole('heading', { name: 'Accessible Signing Document', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sign Document', level: 2 })).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Signing progress' }).first()).toHaveAttribute(
      'aria-valuenow',
      '0',
    );

    const sidebarResults = await new AxeBuilder({ page })
      .include('.embed--DocumentWidgetContainer')
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();

    expectNoSeriousAccessibilityViolations(sidebarResults.violations);

    await page.getByRole('button', { name: 'Add signature' }).click();
    await expect(page.getByRole('dialog', { name: 'Add your signature' })).toBeVisible();

    const dialogResults = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();

    expectNoSeriousAccessibilityViolations(dialogResults.violations);

    await page.getByRole('tab', { name: 'Type' }).click();
    await page.getByLabel('Type your signature').fill('Accessible Signer');
    await page.getByRole('button', { name: 'Next' }).click();

    const signatureActivation = page.getByTestId(`signing-field-activation-${signatureField.id}`);

    await expect(signatureActivation).toHaveAccessibleName('Insert Signature field');
    await signatureActivation.focus();
    await page.keyboard.press('Enter');

    await expect(page.getByText('0 Fields Remaining').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('progressbar', { name: 'Signing progress' }).first()).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
  });
});
