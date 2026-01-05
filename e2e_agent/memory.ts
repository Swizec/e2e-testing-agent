import fs from "fs/promises";
import crypto from "crypto";

function getFilename(url: string, goal: string): string {
    const hash = crypto
        .createHash("md5")
        .update(url + goal)
        .digest("hex");

    const filename = `test_replays/${hash}.json`;

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

    await fs.mkdir("test_replays", { recursive: true });
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
