import OpenAI from "openai";
import { chromium } from "playwright";

const openai = new OpenAI();

const browser = await chromium.launch({
    headless: false,
    chromiumSandbox: true,
    env: {},
    args: ["--disable-extensions", "--disable-filesystem"],
});

const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 720 });
await page.goto("https://scalingfastbook.com");

const screenshotBuffer = await page.screenshot({ type: "png" });

const response = await openai.responses.create({
    model: "computer-use-preview",
    tools: [
        {
            type: "computer_use_preview",
            display_width: 1280,
            display_height: 720,
            environment: "browser",
        },
    ],
    input: [
        {
            role: "user",
            content:
                "Sign up for a preview of the Scaling Fast book at scalingfastbook.com",
        },
    ],
    reasoning: { summary: "concise" },
    truncation: "auto",
});

await browser.close();

console.log(response.output);

// const browser = await chromium.launch({
//     headless: false,
//     chromiumSandbox: true,
//     env: {},
//     args: ["--disable-extensions", "--disable-filesystem"],
// });

// const page = await browser.newPage();
// await page.setViewportSize({ width: 1280, height: 720 });
// await page.goto("https://scalingfastbook.com");
// await page.waitForTimeout(10000);

// browser.close();

// const client = new OpenAI();

// const response = await client.responses.create({
//     model: "gpt-5-nano",
//     input: "Write a super short bed time story about a unicorn who learns to code in JavaScript.",
// });

// console.log(response.output_text);
