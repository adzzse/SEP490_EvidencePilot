import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

test('OTP input keeps the six-digit Profile contract', async (t) => {
  const server = await createServer({
    root: projectRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
  });
  server.middlewares.use(async (request, response, next) => {
    if (request.url !== '/__otp_test__') return next();
    response.setHeader('Content-Type', 'text/html');
    response.end(await server.transformIndexHtml(request.url, `
      <div id="root"></div>
      <script type="module">
        import React, { createRef } from 'react';
        import { createRoot } from 'react-dom/client';
        import '/src/index.css';
        import OtpInput from '/src/components/ui/OtpInput.jsx';

        const events = [];
        const ref = createRef();
        const root = createRoot(document.getElementById('root'));
        const render = (props = {}) => root.render(React.createElement(OtpInput, {
          ref,
          label: 'Email verification code',
          hint: 'Enter the six-digit code',
          onChange: (value) => events.push(['change', value]),
          onComplete: (value) => events.push(['complete', value]),
          ...props,
        }));
        window.otpHarness = { events, ref, render };
        render();
      </script>
    `));
  });
  await server.listen();
  t.after(() => server.close());

  const browser = await chromium.launch({ channel: 'chrome' });
  t.after(() => browser.close());

  const address = server.httpServer.address();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/__otp_test__`);

  const input = page.getByRole('textbox', { name: 'Email verification code' });
  await input.waitFor({ timeout: 5000 });
  assert.equal(await page.locator('input').count(), 1);
  assert.equal(await page.getByRole('textbox').count(), 1);
  assert.equal(await input.getAttribute('autocomplete'), 'one-time-code');
  assert.equal(await input.getAttribute('inputmode'), 'numeric');
  assert.equal(await input.getAttribute('maxlength'), '6');

  const visual = page.locator('[data-otp-visual]');
  const cells = page.locator('[data-otp-cell]');
  assert.equal(await cells.count(), 6);
  assert.equal(await visual.getAttribute('aria-hidden'), 'true');

  await input.evaluate((element) => element.blur());
  const visualBox = await visual.boundingBox();
  await page.mouse.click(
    visualBox.x + visualBox.width / 2,
    visualBox.y + visualBox.height / 2,
  );
  assert.equal(await input.evaluate((element) => element === document.activeElement), true);
  assert.equal(await input.evaluate((element) => element.tabIndex), 0);
  assert.equal(await cells.nth(0).getAttribute('data-active'), 'true');

  const completeValues = () => page.evaluate(() => window.otpHarness.events
    .filter(([type]) => type === 'complete')
    .map(([, value]) => value));
  const paste = (value) => input.evaluate((element, pastedValue) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', pastedValue);
    element.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData,
    }));
  }, value);

  await input.fill('12a34');
  assert.equal(await input.inputValue(), '1234');
  assert.deepEqual(await completeValues(), []);

  await paste('98 76-54');
  assert.equal(await input.inputValue(), '987654');
  assert.deepEqual(await completeValues(), ['987654']);
  const firstDigit = cells.nth(0).locator('span').first();
  assert.equal(
    await firstDigit.evaluate((element) => getComputedStyle(element).animationName),
    'otpDigitEnter',
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await firstDigit.evaluate((element) => getComputedStyle(element).animationName),
    'none',
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await paste('98 76-54');
  assert.deepEqual(await completeValues(), ['987654']);

  await paste('12x34-56');
  assert.equal(await input.inputValue(), '123456');
  assert.deepEqual(await completeValues(), ['987654']);

  await page.evaluate(() => window.otpHarness.ref.current.clear());
  assert.equal(await input.inputValue(), '');
  await input.fill('987654');
  assert.deepEqual(await completeValues(), ['987654', '987654']);

  await input.fill('123456');
  assert.deepEqual(await completeValues(), ['987654', '987654', '123456']);

  await paste('65 43-210');
  assert.equal(await input.inputValue(), '654321');
  assert.deepEqual(await completeValues(), ['987654', '987654', '123456']);

  await page.evaluate(() => window.otpHarness.ref.current.clear());
  assert.equal(await input.evaluate((element) => element === document.activeElement), true);
  await input.fill('1234');
  await input.press('Home');
  assert.equal(await cells.nth(0).getAttribute('data-active'), 'true');
  await input.press('Delete');
  assert.equal(await input.inputValue(), '234');
  await input.press('End');
  assert.equal(await cells.nth(3).getAttribute('data-active'), 'true');
  await input.press('ArrowLeft');
  await input.press('Backspace');
  assert.equal(await input.inputValue(), '24');
  await input.fill('123456');
  await input.evaluate((element) => element.setSelectionRange(1, 5));
  await input.press('Delete');
  assert.equal(await input.inputValue(), '16');
  await page.evaluate(() => window.otpHarness.ref.current.focus());
  assert.equal(await input.evaluate((element) => element === document.activeElement), true);

  await page.evaluate(() => window.otpHarness.render({
    disabled: true,
    status: 'error',
    errorMessage: 'Invalid code',
  }));
  await input.waitFor({ state: 'visible' });
  assert.equal(await input.isDisabled(), true);
  assert.equal(await input.getAttribute('aria-invalid'), 'true');
  const status = page.getByRole('status');
  assert.equal(await status.textContent(), 'Invalid code');
  assert.equal(await input.getAttribute('aria-describedby'), await status.getAttribute('id'));

  await page.evaluate(() => window.otpHarness.render({
    status: 'error',
    errorMessage: 'Invalid code',
  }));
  await page.waitForFunction(() => !document.querySelector('input').disabled);
  assert.equal(await input.evaluate((element) => element === document.activeElement), true);
});
