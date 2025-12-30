import { test, expect } from "bun:test";
import { e2e_test } from ".";

test("supports email signup", async () => {
    const success = await e2e_test(
        "https://scalingfastbook.com",
        "Sign up for a preview of the Scaling Fast book"
    );
    expect(success).toBe(true);
});

test("shows testimonials", async () => {
    const success = await e2e_test(
        "https://scalingfastbook.com",
        "Verify the page has testimonials from readers who have benefited from the Scaling Fast book"
    );
    expect(success).toBe(true);
});

test("shows pitch video", async () => {
    const success = await e2e_test(
        "https://scalingfastbook.com",
        "Verify the page has pitch video from the author"
    );
    expect(success).toBe(true);
});
