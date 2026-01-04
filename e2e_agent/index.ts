import { chromium, type Page } from "playwright";
import { type ToolDefinition } from "./tools";
import { canReplayActions } from "./memory";
import { replayActions, testFromReplay, testFromScratch } from "./agent";

async function openBrowser(url: string): Promise<Page> {
    const browser = await chromium.launch({
        headless: false,
        chromiumSandbox: true,
        env: {},
        args: ["--disable-extensions", "--disable-filesystem"],
    });

    const displayWidth = Number(process.env.DISPLAY_WIDTH);
    const displayHeight = Number(process.env.DISPLAY_HEIGHT);

    const page = await browser.newPage();
    await page.setViewportSize({
        width: displayWidth,
        height: displayHeight,
    });
    await page.goto(url);

    return page;
}

export async function continue_from(url: string, goal: string): Promise<Page> {
    const page = await openBrowser(url);
    const replayed = await replayActions(url, goal, page);

    if (!replayed) {
        throw new Error(
            "No saved computer call stack found for the given URL and goal."
        );
    }

    return page;
}

export async function e2e_test(
    start_location: string | Page,
    goal: string,
    tools: ToolDefinition[] = []
): Promise<boolean> {
    let page: Page;

    if (typeof start_location === "string") {
        page = await openBrowser(start_location);
    } else {
        page = start_location;
    }

    const startUrl = page.url();

    if (await canReplayActions(startUrl, goal)) {
        return await testFromReplay(startUrl, goal, page);
    } else {
        return await testFromScratch(startUrl, goal, page, tools);
    }
}
