import OpenAI from "openai";
const client = new OpenAI();

const response = await client.responses.create({
    model: "gpt-5",
    input: "Write a short poem about TypeScript.",
});

console.log(response.output_text);
