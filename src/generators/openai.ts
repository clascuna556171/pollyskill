import { SkillIR } from '../ir/types.js';

export class OpenAIGenerator {
  /**
   * Generates standard OpenAI Function Calling schemas and Anthropic Tool definitions.
   */
  static generate(ir: SkillIR): Record<string, string> {
    const files: Record<string, string> = {};
    const dir = `api-tools/${ir.name}`;

    // OpenAI Format: tools: [{ type: "function", function: { name, description, parameters } }]
    const openAITools = ir.tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: `[Risk: ${tool.riskLevel}] ${tool.description}`,
        parameters: {
          type: 'object',
          properties: tool.parameters.properties,
          required: tool.parameters.required || []
        }
      }
    }));

    // Anthropic Format: tools: [{ name, description, input_schema }]
    const anthropicTools = ir.tools.map(tool => ({
      name: tool.name,
      description: `[Risk: ${tool.riskLevel}] ${tool.description}`,
      input_schema: {
        type: 'object',
        properties: tool.parameters.properties,
        required: tool.parameters.required || []
      }
    }));

    files[`${dir}/openai-tools.json`] = JSON.stringify({ tools: openAITools }, null, 2) + '\n';
    files[`${dir}/anthropic-tools.json`] = JSON.stringify({ tools: anthropicTools }, null, 2) + '\n';

    return files;
  }
}
