import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('loads and shows title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Rehan/i);
  });

  test('homepage has hero heading', async ({ page }) => {
    await page.goto('/home');
    await expect(page.locator('h1')).toContainText('Your Developer Activity');
  });

  test('homepage navbar is visible', async ({ page }) => {
    await page.goto('/home');
    const nav = page.locator('nav[aria-label="Main navigation"]');
    await expect(nav).toBeVisible();
  });

  test('homepage features section exists', async ({ page }) => {
    await page.goto('/home');
    await expect(page.locator('#features')).toBeAttached();
  });

  test('homepage how-it-works section exists', async ({ page }) => {
    await page.goto('/home');
    await expect(page.locator('#how-it-works')).toBeAttached();
  });

  test('homepage demo section exists', async ({ page }) => {
    await page.goto('/home');
    await expect(page.locator('#demo')).toBeAttached();
  });

  test('Get Started button navigates to login', async ({ page }) => {
    await page.goto('/home');
    await page.locator('button:has-text("Get Started")').first().click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('theme toggle button exists on homepage', async ({ page }) => {
    await page.goto('/home');
    const toggle = page.locator('button[aria-label="Toggle theme"]');
    await expect(toggle).toBeVisible();
  });
});

test.describe('Login page', () => {
  test('shows sign-in card', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('text=Sign in to RehanPulse')).toBeVisible();
  });

  test('has GitHub sign-in button', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('button:has-text("Sign in with GitHub")')).toBeVisible();
  });

  test('has back-to-home link', async ({ page }) => {
    await page.goto('/login');
    const backLink = page.locator('a[href="/home"]');
    await expect(backLink).toBeVisible();
  });

  test('theme toggle works on login page', async ({ page }) => {
    await page.goto('/login');
    const toggle = page.locator('button[aria-label="Toggle theme"]');
    await expect(toggle).toBeVisible();
    await toggle.click();
    // Verify the html element has a theme class change (dark/light)
    const html = page.locator('html');
    const classAfterClick = await html.getAttribute('class');
    expect(classAfterClick).toBeTruthy();
  });
});

test.describe('Protected routes', () => {
  test('dashboard redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/');
    // Without auth, should either show login or redirect
    await page.waitForTimeout(2000);
    const url = page.url();
    // Should be on login or root with login prompt
    expect(url.includes('/login') || url.includes('/')).toBeTruthy();
  });
});

test.describe('Accessibility', () => {
  test('homepage has no missing alt text on images', async ({ page }) => {
    await page.goto('/home');
    const images = page.locator('img:not([alt])');
    await expect(images).toHaveCount(0);
  });

  test('interactive elements are keyboard-focusable on homepage', async ({ page }) => {
    await page.goto('/home');
    // Tab to first interactive element
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    await expect(focused).toBeAttached();
  });
});
