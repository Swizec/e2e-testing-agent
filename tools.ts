import OpenAI from "openai";
import { faker } from "@faker-js/faker";

export type ToolDefinition = {
    name: string;
    description: string;
    parameters?: Record<string, any>;
    handleCall: () => string;
};

const fakerTools: ToolDefinition[] = [
    {
        name: "get_email",
        description: "Generates an email address.",
        handleCall: () => {
            return faker.internet.email();
        },
    },
    {
        name: "get_name",
        description: "Generates a person's full name.",
        handleCall: () => {
            return faker.person.fullName();
        },
    },
];

export function toolsForModelCall(
    availableTools: ToolDefinition[]
): OpenAI.Responses.FunctionTool[] {
    return availableTools.map((tool) => ({
        type: "function",
        name: tool.name,
        strict: false,
        description: tool.description,
        parameters: tool.parameters ?? {},
    }));
}

// TODO: support all Faker functions
export function handleFunctionCalls(
    response: OpenAI.Responses.Response,
    availableTools: ToolDefinition[]
): OpenAI.Responses.ResponseFunctionToolCallOutputItem[] {
    const toolCalls = response.output.filter(
        (item) => item.type === "function_call"
    );
    const functionCallOutputs = [];

    const toolMap = new Map<string, ToolDefinition>();
    for (const tool of availableTools) {
        toolMap.set(tool.name, tool);
    }

    for (const toolCall of toolCalls) {
        if (toolCall.type === "function_call") {
            functionCallOutputs.push({
                id: toolCall.call_id.replace(/^call_/, "fc_"),
                call_id: toolCall.call_id,
                type: "function_call_output",
                output: (() => {
                    return (
                        toolMap.get(toolCall.name)?.handleCall() ??
                        `Unknown function: ${toolCall.name}`
                    );
                })(),
            });
        }
    }

    return functionCallOutputs;
}

export const builtinTools = [...fakerTools];
