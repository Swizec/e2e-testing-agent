import OpenAI from "openai";
import { type Page } from "playwright";
import {
    builtinTools,
    handleFunctionCalls,
    toolsForModelCall,
    type ToolDefinition,
} from "./tools";
import { getReplay, storeReplay } from "./memory";

const openai = new OpenAI();

async function handleModelAction(
    page: Page,
    action:
        | OpenAI.Responses.ResponseComputerToolCall.Click
        | OpenAI.Responses.ResponseComputerToolCall.DoubleClick
        | OpenAI.Responses.ResponseComputerToolCall.Drag
        | OpenAI.Responses.ResponseComputerToolCall.Keypress
        | OpenAI.Responses.ResponseComputerToolCall.Move
        | OpenAI.Responses.ResponseComputerToolCall.Screenshot
        | OpenAI.Responses.ResponseComputerToolCall.Scroll
        | OpenAI.Responses.ResponseComputerToolCall.Type
        | OpenAI.Responses.ResponseComputerToolCall.Wait
) {
    // Given a computer action (e.g., click, double_click, scroll, etc.),
    // execute the corresponding operation on the Playwright page.

    const actionType = action.type;

    try {
        switch (actionType) {
            case "click": {
                const { x, y, button = "left" } = action;
                console.log(
                    `Action: click at (${x}, ${y}) with button '${button}'`
                );
                await page.mouse.click(x, y, { button });
                break;
            }

            case "scroll": {
                const { x, y, scroll_x, scroll_y } = action;
                console.log(
                    `Action: scroll at (${x}, ${y}) with offsets (scrollX=${scroll_x}, scrollY=${scroll_y})`
                );
                await page.mouse.move(x, y);
                await page.evaluate(
                    `window.scrollBy(${scroll_x}, ${scroll_y})`
                );
                break;
            }

            case "keypress": {
                const { keys } = action;
                for (const k of keys) {
                    console.log(`Action: keypress '${k}'`);
                    // A simple mapping for common keys; expand as needed.
                    if (k.includes("ENTER")) {
                        await page.keyboard.press("Enter");
                    } else if (k.includes("SPACE")) {
                        await page.keyboard.press(" ");
                    } else {
                        await page.keyboard.press(k);
                    }
                }
                break;
            }

            case "type": {
                const { text } = action;
                console.log(`Action: type text '${text}'`);
                await page.keyboard.type(text);
                break;
            }

            case "wait": {
                console.log(`Action: wait`);
                await page.waitForTimeout(3000);
                break;
            }

            case "screenshot": {
                // Nothing to do as screenshot is taken at each turn
                console.log(`Action: screenshot`);
                break;
            }

            // Handle other actions here

            default:
                console.log("Unrecognized action:", action);
        }
    } catch (e) {
        console.error("Error handling action", action, ":", e);
    }
}

async function computerUseLoop(
    page: Page,
    response: OpenAI.Responses.Response,
    availableTools: ToolDefinition[]
): Promise<[OpenAI.Responses.Response, any[]]> {
    /**
     * Run the loop that executes computer actions and tool calls until no 'computer_call' or 'function_call' is found.
     */
    const computerCallStack = [];

    while (true) {
        console.debug(response.output);

        const functionCallOutputs = handleFunctionCalls(
            response,
            availableTools
        );

        const computerCalls = response.output.filter(
            (item) => item.type === "computer_call"
        );

        if (computerCalls.length === 0 && functionCallOutputs.length === 0) {
            console.debug("No computer or tool calls found. Final output:");
            console.debug(JSON.stringify(response.output, null, 2));

            break; // Exit when no computer calls are issued.
        }

        let hasNewAction = false;

        if (computerCalls[0]) {
            computerCallStack.push(computerCalls[0]);
            hasNewAction = true;
        }

        // We expect at most one computer call per response.
        const lastComputerCall =
            computerCallStack[computerCallStack.length - 1];
        const lastCallId = lastComputerCall?.call_id;
        const action = lastComputerCall?.action;
        const safetyChecks = lastComputerCall?.pending_safety_checks || [];

        console.debug("safety checks", safetyChecks);

        if (hasNewAction && action) {
            // Execute the action (function defined in step 3)
            handleModelAction(page, action);
            await new Promise((resolve) => setTimeout(resolve, 200)); // Allow time for changes to take effect.
        }

        // Take a screenshot after the action
        const screenshotBytes = await page.screenshot();
        const screenshotBase64 =
            Buffer.from(screenshotBytes).toString("base64");

        console.debug("Calling model with screenshot and tool outputs...");

        // Send the screenshot back as a computer_call_output
        response = await openai.responses.create({
            model: "computer-use-preview",
            previous_response_id: response.id,
            tools: [
                {
                    type: "computer_use_preview",
                    display_width: Number(process.env.DISPLAY_WIDTH),
                    display_height: Number(process.env.DISPLAY_HEIGHT),
                    environment: "browser",
                },
                ...toolsForModelCall(availableTools),
            ],
            input: [
                {
                    call_id: lastCallId,
                    type: "computer_call_output",
                    acknowledged_safety_checks: safetyChecks,
                    output: {
                        type: "input_image",
                        image_url: `data:image/png;base64,${screenshotBase64}`,
                    },
                },
                ...functionCallOutputs,
            ],
            truncation: "auto",
        });
    }

    return [response, computerCallStack];
}

async function verifyGoalAchieved(
    response: OpenAI.Responses.Response,
    goal: string
): Promise<boolean> {
    /**
     * Verify if the goal has been achieved based on the model's final response.
     */

    console.debug(
        "Verifying response against goal",
        JSON.stringify(
            [
                {
                    role: "user",
                    content: `Based on the following information, did the agent successfully accomplish the goal: "${goal}"? Respond with "yes" or "no" only.`,
                },
                {
                    role: "user",
                    content: `Final agent response: ${JSON.stringify(
                        response.output,
                        null,
                        2
                    )}`,
                },
            ],
            null,
            2
        )
    );

    const verificationResponse = await openai.responses.create({
        model: "gpt-5-nano",
        input: [
            {
                role: "user",
                content: `Based on the following information, did the agent successfully accomplish the goal: "${goal}"? Respond with "yes" or "no" only.`,
            },
            {
                role: "user",
                content: `Final agent response: ${JSON.stringify(
                    response.output,
                    null,
                    2
                )}`,
            },
        ],
    });

    console.debug(JSON.stringify(verificationResponse.output, null, 2));

    const answer = verificationResponse.output
        .map((item) => {
            if (item.type === "message") {
                return item.content
                    .filter((c) => c.type === "output_text")
                    .map((c) => c.text)
                    .join(" ")
                    .toString()
                    .toLowerCase();
            }
            return "";
        })
        .join(" ");

    console.debug("Verification answer:", answer);
    return answer.includes("yes") && !answer.includes("no");
}

async function verifyGoalAchievedFromScreenshot(
    screenshotBase64: string,
    goal: string
): Promise<boolean> {
    /**
     * Verify if the goal has been achieved based on the model's final response.
     */

    const verificationResponse = await openai.responses.create({
        model: "gpt-5-nano",
        input: [
            {
                role: "user",
                content: [
                    {
                        type: "input_text",
                        text: `Based on the following information, did the agent successfully accomplish the goal: "${goal}"? Respond with "yes" or "no" only.`,
                    },
                    {
                        type: "input_image",
                        image_url: `data:image/png;base64,${screenshotBase64}`,
                        detail: "high",
                    },
                ],
            },
        ],
    });

    console.debug(JSON.stringify(verificationResponse.output, null, 2));

    const answer = verificationResponse.output
        .map((item) => {
            if (item.type === "message") {
                return item.content
                    .filter((c) => c.type === "output_text")
                    .map((c) => c.text)
                    .join(" ")
                    .toString()
                    .toLowerCase();
            }
            return "";
        })
        .join(" ");

    console.debug("Verification answer:", answer);
    return answer.includes("yes") && !answer.includes("no");
}

export async function replayActions(
    url: string,
    goal: string,
    page: Page
): Promise<boolean> {
    const computerCallStack = await getReplay(url, goal);

    if (computerCallStack) {
        console.debug(
            `Restoring previous computer call stack with ${computerCallStack.length} actions...`
        );

        for (const call of computerCallStack) {
            const action = call.action;
            if (action) {
                await handleModelAction(page, action);
                await new Promise((resolve) => setTimeout(resolve, 500)); // Allow time for changes to take effect.
            }
        }
    }

    return !!computerCallStack;
}

async function takeScreenshotAsBase64(page: Page): Promise<string> {
    const screenshotBytes = await page.screenshot();
    const screenshotBase64 = Buffer.from(screenshotBytes).toString("base64");
    return screenshotBase64;
}

export async function testFromReplay(
    url: string,
    goal: string,
    page: Page
): Promise<boolean> {
    await replayActions(url, goal, page);
    const screenshotBase64 = await takeScreenshotAsBase64(page);

    const passed = await verifyGoalAchievedFromScreenshot(
        screenshotBase64,
        goal
    );
    // browser.close();

    return passed;
}

export async function testFromScratch(
    url: string,
    goal: string,
    page: Page,
    tools: ToolDefinition[]
): Promise<boolean> {
    const openai = new OpenAI();
    const availableTools: ToolDefinition[] = [...builtinTools, ...tools];

    const screenshotBase64 = await takeScreenshotAsBase64(page);

    const response = await openai.responses.create({
        model: "computer-use-preview",
        tools: [
            {
                type: "computer_use_preview",
                display_width: Number(process.env.DISPLAY_WIDTH),
                display_height: Number(process.env.DISPLAY_HEIGHT),
                environment: "browser",
            },
            ...toolsForModelCall(availableTools),
        ],
        input: [
            {
                role: "system",
                content:
                    "You are an autonomous agent running in a sandbox environment designed to test web applications. Use the browser and provided tools to accomplish the user's goal. Submit forms without asking the user for confirmation.",
            },
            {
                role: "user",
                content: [
                    {
                        type: "input_text",
                        text: `You are in a browser navigated to ${url}. ${goal}.`,
                    },
                    {
                        type: "input_image",
                        image_url: `data:image/png;base64,${screenshotBase64}`,
                        detail: "high",
                    },
                ],
            },
        ],
        reasoning: {
            summary: "concise",
        },
        truncation: "auto",
    });

    const [finalResponse, computerCallStack] = await computerUseLoop(
        page,
        response,
        availableTools
    );

    await storeReplay(url, goal, computerCallStack);

    // browser.close();

    console.debug("Verifying goal achieved");
    const passed = await verifyGoalAchieved(finalResponse, goal);

    return passed;
}
