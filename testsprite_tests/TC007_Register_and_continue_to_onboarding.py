import asyncio
import re
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None

    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()

        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",
                "--disable-dev-shm-usage",
                "--ipc=host",
                "--single-process"
            ],
        )

        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        # Wider default timeout to match the agent's DOM-stability budget;
        # auto-waiting Playwright APIs (expect, locator.wait_for) inherit this.
        context.set_default_timeout(15000)

        # Open a new page in the browser context
        page = await context.new_page()

        # Interact with the page elements to simulate user flow
        # -> navigate
        await page.goto("http://localhost:3000")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Click the 'Create account' link to open the registration page.
        # Create account link
        elem = page.get_by_role('link', name='Create account', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the 'Full name', 'Email', and 'Password' fields and click the 'Continue to setup' button.
        # name text field
        elem = page.locator('xpath=/html/body/main/section[2]/div/div[2]/div/form/div/input')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("E2E Test User")
        
        # -> Fill the 'Full name', 'Email', and 'Password' fields and click the 'Continue to setup' button.
        # email email field
        elem = page.locator('xpath=/html/body/main/section[2]/div/div[2]/div/form/div[2]/input')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("e2e+20260714T120000@example.com")
        
        # -> Fill the 'Full name', 'Email', and 'Password' fields and click the 'Continue to setup' button.
        # password password field
        elem = page.locator('xpath=/html/body/main/section[2]/div/div[2]/div/form/div[3]/input')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Testpass1!")
        
        # -> Fill the 'Full name', 'Email', and 'Password' fields and click the 'Continue to setup' button.
        # Continue to setup button
        elem = page.get_by_role('button', name='Continue to setup', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the onboarding screen is displayed
        # Assert: Onboarding consent label displays the exact expected text.
        await expect(page.locator("xpath=/html/body/main/div/div/div[2]/div/div[1]/label").nth(0)).to_have_text("I understand this is research only and not investment advice", timeout=15000), "Onboarding consent label displays the exact expected text."
        # Assert: Onboarding heading 'Know what this terminal is—and is not.' is visible.
        await expect(page.locator("xpath=/html/body/main/div/div/div[2]/div/div[1]/div[1]").nth(0)).to_contain_text("Know what this terminal is\u2014and is not.", timeout=15000), "Onboarding heading 'Know what this terminal is\u2014and is not.' is visible."
        await page.locator("xpath=/html/body/main/div/div/div[2]/div/div[2]/button[2]").nth(0).scroll_into_view_if_needed()
        # Assert: Onboarding Continue button is visible.
        await expect(page.locator("xpath=/html/body/main/div/div/div[2]/div/div[2]/button[2]").nth(0)).to_be_visible(timeout=15000), "Onboarding Continue button is visible."
        current_url = await page.evaluate("() => window.location.href")
        # Assert: page loaded with a URL (final outcome verified by the AI judge during the run)
        assert current_url, 'Page should have loaded with a URL'
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    