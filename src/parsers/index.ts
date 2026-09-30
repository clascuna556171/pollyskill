import { SkillIR } from '../ir/types.js';
import { OpenAPIParser } from './openapi.js';
import { ScriptParser } from './script.js';
import { ManifestParser } from './manifest.js';
import { BashParser } from './bash.js';

export class UniversalParser {
  /**
   * Intelligently auto-detects the format of the incoming source content
   * and parses it into a canonical SkillIR.
   */
  static parse(content: string, filename?: string): SkillIR {
    const trimmed = content.trim();
    const ext = filename ? filename.slice(filename.lastIndexOf('.')).toLowerCase() : '';

    // 1. Bash / Shell script source
    if (ext === '.sh' || ext === '.bash' || trimmed.startsWith('#!/bin/bash') || trimmed.startsWith('#!/bin/sh') || trimmed.startsWith('#!/usr/bin/env bash')) {
      return BashParser.parse(content, filename || 'script.sh');
    }

    // 2. Python source
    if (ext === '.py' || (trimmed.includes('def ') && (trimmed.includes('import ') || trimmed.includes('print(') || trimmed.includes(':')))) {
      return ScriptParser.parsePython(content, filename || 'script.py');
    }

    // 3. TypeScript / JavaScript source
    if (ext === '.ts' || ext === '.js' || (trimmed.includes('export function') || trimmed.includes('export const'))) {
      return ScriptParser.parseTypeScript(content, filename || 'script.ts');
    }

    // 3. JSON or YAML: Check if OpenAPI or SkillSpec
    if (trimmed.startsWith('{') || ext === '.json' || ext === '.yaml' || ext === '.yml') {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.openapi || parsed.swagger || (parsed.paths && parsed.info)) {
          return OpenAPIParser.parse(parsed, filename);
        }
        if (parsed.tools || parsed.schemaVersion || parsed.category) {
          return ManifestParser.parse(trimmed, filename);
        }
      } catch {
        // Not standard JSON, might be YAML
        if (trimmed.includes('openapi:') || trimmed.includes('swagger:') || trimmed.includes('paths:')) {
          // It's OpenAPI YAML
          // Convert basic yaml or parse as Manifest
          return ManifestParser.parse(trimmed, filename);
        }
      }

      // Default to ManifestParser for general YAML/JSON skill manifests
      return ManifestParser.parse(trimmed, filename || 'spec.yaml');
    }

    // Fallback: Parse as SkillSpec manifest
    return ManifestParser.parse(trimmed, filename || 'spec.yaml');
  }
}
