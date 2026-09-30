import { SkillIR, CompilerTarget } from '../ir/types.js';
import { AntigravityGenerator } from './antigravity.js';
import { MCPGenerator } from './mcp.js';
import { MCPSSEGenerator } from './mcp-sse.js';
import { CursorGenerator } from './cursor.js';
import { OpenAIGenerator } from './openai.js';

export class TargetEmissions {
  static emit(ir: SkillIR, targets: CompilerTarget[] = ['all']): Record<string, string> {
    const files: Record<string, string> = {};
    const shouldEmitAll = targets.includes('all');

    if (shouldEmitAll || targets.includes('antigravity')) {
      Object.assign(files, AntigravityGenerator.generate(ir));
    }

    if (shouldEmitAll || targets.includes('mcp')) {
      Object.assign(files, MCPGenerator.generate(ir));
    }

    if (shouldEmitAll || targets.includes('mcp-sse') || targets.includes('mcp')) {
      Object.assign(files, MCPSSEGenerator.generate(ir));
    }

    if (shouldEmitAll || targets.includes('cursor')) {
      Object.assign(files, CursorGenerator.generate(ir));
    }

    if (shouldEmitAll || targets.includes('openai')) {
      Object.assign(files, OpenAIGenerator.generate(ir));
    }

    return files;
  }
}
