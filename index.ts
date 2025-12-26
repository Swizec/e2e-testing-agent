import OpenAI from "openai";
import { chromium } from "playwright";

const browser = await chromium.launch({
    headless: false,
    chromiumSandbox: true,
    env: {},
    args: ["--disable-extensions", "--disable-filesystem"],
});

const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 720 });
await page.goto("https://scalingfastbook.com");
await page.waitForTimeout(10000);

browser.close();

// const client = new OpenAI();

// const response = await client.responses.create({
//     model: "gpt-5-nano",
//     input: "Write a super short bed time story about a unicorn who learns to code in JavaScript.",
// });

// console.log(response.output_text);
