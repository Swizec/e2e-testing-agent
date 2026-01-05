import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

function getCallingTestFilename() {
    const err = new Error();
    const stack = err.stack?.split("\n") ?? [];

    // Skip internal frames until we leave node_modules / your framework
    const frame = stack.find(
        (line) =>
            // prefer test/spec files but skip node_modules
            !line.includes("node_modules") &&
            (line.includes(".test") || line.includes(".spec"))
    );

    const callingTestInfo = frame?.trim();

    // Examples of frames we expect:
    // at async <anonymous> (/path/to/file.test.ts:5:26)
    // at /path/to/file.test.ts:5:26
    const m =
        callingTestInfo?.match(/\((.*?):(\d+):(\d+)\)$/) ||
        callingTestInfo?.match(/at (.*?):(\d+):(\d+)$/);

    const filename = m?.[1] ?? null;

    // Return only the basename (file name with extension), not the full path
    const base = filename ? path.basename(filename) : null;

    return base;
}

function getFilename(url: string, goal: string): string {
    const hash = crypto
        .createHash("md5")
        .update(url.replace(/\/$/, "") + goal)
        .digest("hex");

    const testFilename = getCallingTestFilename();
    const filename = `test_replays/${testFilename}/${hash}.json`;

    return filename;
}

export async function storeReplay(
    url: string,
    goal: string,
    computerCallStack: any[]
) {
    /**
     * Store the computer call stack for future reference.
     */
    const filename = getFilename(url, goal);

    // Ensure the directory for the filename exists before writing.
    const dir = path.dirname(filename);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(
        filename,
        JSON.stringify(
            {
                url,
                goal,
                computerCallStack,
            },
            null,
            2
        )
    );
}

export async function getReplay(
    url: string,
    goal: string
): Promise<any[] | null> {
    /**
     * Restore the computer call stack if it exists.
     */
    const filename = getFilename(url, goal);

    console.debug({ url, goal, filename });

    try {
        const data = await fs.readFile(filename, "utf-8");
        const parsed = JSON.parse(data);
        return parsed.computerCallStack;
    } catch (e) {
        return null;
    }
}

export async function canReplayActions(
    url: string,
    goal: string
): Promise<boolean> {
    /**
     * Check if a replay exists for the given URL and goal.
     */
    const filename = getFilename(url, goal);

    try {
        await fs.access(filename);
        return true;
    } catch (e) {
        return false;
    }
}
