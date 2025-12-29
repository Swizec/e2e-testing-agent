import OpenAI from "openai";
import { chromium, type Page } from "playwright";
import { faker } from "@faker-js/faker";
import { v7 as uuid } from "uuid";

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
                const { x, y, scrollX, scrollY } = action;
                console.log(
                    `Action: scroll at (${x}, ${y}) with offsets (scrollX=${scrollX}, scrollY=${scrollY})`
                );
                await page.mouse.move(x, y);
                await page.evaluate(`window.scrollBy(${scrollX}, ${scrollY})`);
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
                await page.waitForTimeout(2000);
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

const fakerTools: OpenAI.Responses.FunctionTool[] = [
    {
        type: "function",
        name: "get_email",
        strict: false,
        description: "Generates an email address.",
        parameters: {},
    },
    {
        type: "function",
        name: "get_name",
        strict: false,
        description: "Generates a person's full name.",
        parameters: {},
    },
];

function handleFunctionCalls(
    response: OpenAI.Responses.Response
): OpenAI.Responses.ResponseFunctionToolCallOutputItem[] {
    const toolCalls = response.output.filter(
        (item) => item.type === "function_call"
    );
    const functionCallOutputs = [];

    for (const toolCall of toolCalls) {
        if (toolCall.type === "function_call") {
            functionCallOutputs.push({
                id: toolCall.call_id.replace(/^call_/, "fc_"),
                call_id: toolCall.call_id,
                type: "function_call_output",
                output: (() => {
                    switch (toolCall.name) {
                        case "get_email":
                            return faker.internet.email();
                        case "get_name":
                            return faker.person.fullName();
                        default:
                            return `Unknown function: ${toolCall.name}`;
                    }
                })(),
            });
        }
    }

    return functionCallOutputs;
}

async function computerUseLoop(
    page: Page,
    response: OpenAI.Responses.Response
): Promise<OpenAI.Responses.Response> {
    /**
     * Run the loop that executes computer actions until no 'computer_call' is found.
     */
    const computerCallStack = [];

    while (true) {
        console.log(response.output);

        const functionCallOutputs = handleFunctionCalls(response);

        const computerCalls = response.output.filter(
            (item) => item.type === "computer_call"
        );

        if (computerCalls.length === 0 && functionCallOutputs.length === 0) {
            console.log("No computer or tool calls found. Final output:");
            response.output.forEach((item) => {
                console.log(JSON.stringify(item, null, 2));
            });
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

        console.log("safety checks", safetyChecks);

        if (hasNewAction && action) {
            // Execute the action (function defined in step 3)
            handleModelAction(page, action);
            await new Promise((resolve) => setTimeout(resolve, 500)); // Allow time for changes to take effect.
        }

        // Take a screenshot after the action
        const screenshotBytes = await page.screenshot();
        const screenshotBase64 =
            Buffer.from(screenshotBytes).toString("base64");

        console.log("Calling model with screenshot and tool outputs...");
        console.log([
            {
                call_id: lastCallId,
                type: "computer_call_output",
                output: {
                    type: "input_image",
                },
            },
            ...functionCallOutputs,
        ]);

        // Send the screenshot back as a computer_call_output
        response = await openai.responses.create({
            model: "computer-use-preview",
            previous_response_id: response.id,
            tools: [
                {
                    type: "computer_use_preview",
                    display_width: 1024,
                    display_height: 768,
                    environment: "browser",
                },
                ...fakerTools,
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

    return response;
}

async function test(url: string, goal: string, onTestEnd: () => void) {
    const openai = new OpenAI();
    const browser = await chromium.launch({
        headless: false,
        chromiumSandbox: true,
        env: {},
        args: ["--disable-extensions", "--disable-filesystem"],
    });

    const displayWidth = 1280;
    const displayHeight = 720;

    const page = await browser.newPage();
    await page.setViewportSize({
        width: displayWidth,
        height: displayHeight,
    });
    await page.goto(url);

    const response = await openai.responses.create({
        model: "computer-use-preview",
        tools: [
            {
                type: "computer_use_preview",
                display_width: displayWidth,
                display_height: displayHeight,
                environment: "browser",
            },
            ...fakerTools,
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
                        text: `You are in a browser navigated to ${url}. ${goal}`,
                    },
                ],
            },
        ],
        reasoning: {
            summary: "concise",
        },
        truncation: "auto",
    });

    await computerUseLoop(page, response);

    await browser.close();
    onTestEnd();
}

await test(
    "https://scalingfastbook.com",
    "Sign up for a preview of the Scaling Fast book",
    () => {}
);
