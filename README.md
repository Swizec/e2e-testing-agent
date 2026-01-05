# e2e-testing-agent

Here’s the idea:
1. You write plain language goal oriented specs
2. Agent looks at your UI and tries to follow the spec
3. Writes cheap-to-run playwright based tests

Goal is to make e2e testing ergonomic to use and cheap to update when things change.

## What it looks like

Here's an example of verifying a checkout flow. The agent figured it out from scratch on first run and recorded every action. Subsequent runs replay those actions on your page and check everything still works.

<a href="https://x.com/Swizec/status/2006748633425985776"><img width="1096" height="1268" alt="screenshot-1767579154979" src="https://github.com/user-attachments/assets/bf055872-906b-4e2e-8725-e22883901175" /></a>

You specify the test in plain language. No fiddly Playwright commands, cumbersome testing code to write, or messing around with the DOM – your tests are fully declarative and goal oriented.

```typescript
test("can purchase a plasmid", async () => {
    const page = await continue_from(
        "https://dev.plasmidsaurus.com",
        `Login as ${process.env.TEST_USER_EMAIL}. You'll see a welcome message upon successful login.`
    );

    const passed = await e2e_test(
        page,
        "Purchase 3 standard high concentration plasmids using a purchase order. Use the 2 Tower Place, San Francisco dropbox as the shipping option",
        [
            {
                name: "get_purchase_order",
                description: "Returns a valid purchase order PO number.",
                handleCall: () => "PO34238124",
            },
        ]
    );

    expect(passed).toBe(true);
});
```

## How to use

`e2e-testing-agent` is extremely early software. Use with caution and please report sharp edges. I have tested with `bun test` but the library should work with every test runner.

The core API consists of 2 functions:

### e2e_test

```typescript
e2e_test(
    start_location: string | Page,
    goal: string,
    tools: ToolDefinition[] = []
): Promise<boolean>
```

Accepts a URL or open Playwright page as the starting point. The `goal` specifies what you want the agent to achieve.

Returns pass/fail as a boolean.

Uses agentic mode on first run then blindly repeats those steps on subsequent runs. 

### continue_from

```typescript
continue_from(url: string, goal: string): Promise<Page>
```

Accepts url and goal that should match an existing test with a stored replay. Returns a page with those steps replayed.

This lets you reuse existing verified steps so your tests are cheaper to run. Similar idea as fixtures.

### Provide tools to the agent

The agent can use tools (function calls) to do work on the page. You can use this to provide custom values for certain actions or execute custom code that interacts with your system.

You pass tools as an array of objects to `e2e_test`:

```typescript
[
    {
        name: "get_password",
        description: "Returns the password for the test user.",
        handleCall: () => process.env.TEST_USER_PASSWORD || "",
    },
]
```

Every tool needs a `name` and `description` that the agent can use to figure out which tools to use, and `handleCall` which is the function to execute. 
