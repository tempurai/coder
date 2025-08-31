import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { z } from 'zod';
import { tool } from 'ai';
import { ToolContext } from './base.js';
import { ToolOutputEvent } from '../events/EventTypes.js';

export const createSaveMemoryTool = (context: ToolContext) => tool({
  description: `Save important information to long-term memory. Use this tool when you need to remember critical facts, preferences, or instructions that should persist across conversations. 
Examples of when to use this:
- User tells you specific project commands ("remember, our test command is npm run test:ci")
- Important project configurations or settings
- User preferences for how they like things done
- Critical facts about the project structure or architecture`,
  inputSchema: z.object({
    content: z.string().describe('The important information to save to memory'),
    category: z.string().optional().describe('Optional category/section for organizing the memory (e.g., "Commands", "Preferences", "Project Info")'),
  }),
  execute: async ({ content, category }) => {
    try {
      // HITL confirmation
      const previewContent = content.substring(0, 150);
      const categoryInfo = category ? ` (Category: ${category})` : '';
      const confirmDescription = `Save to memory${categoryInfo}:\n${previewContent}${content.length > 150 ? '...' : ''}`;

      const confirmed = await context.hitlManager.requestConfirmation(
        'save_memory',
        { content, category },
        confirmDescription
      );

      if (!confirmed) {
        return {
          success: false,
          error: 'Memory save cancelled by user',
          message: 'Memory save operation was cancelled'
        };
      }

      const contextFilePath = getContextFilePath();
      const timestamp = new Date().toISOString().split('T')[0];
      const categoryHeader = category ? `### ${category}` : '### Saved Memories';
      const memoryEntry = `\n${categoryHeader}\n\n**Added on ${timestamp}:**\n${content}\n`;

      let existingContent = '';
      if (fs.existsSync(contextFilePath)) {
        existingContent = fs.readFileSync(contextFilePath, 'utf8');
      }

      const memoriesSectionExists = existingContent.includes('## Long-term Memory');
      let updatedContent: string;

      if (memoriesSectionExists) {
        const memorySectionRegex = /(## Long-term Memory.*?)(\n## |$)/s;
        const match = existingContent.match(memorySectionRegex);
        if (match) {
          const beforeMemory = existingContent.substring(0, match.index);
          const memorySection = match[1];
          const afterMemory = existingContent.substring(match.index! + match[1].length);
          updatedContent = beforeMemory + memorySection + memoryEntry + afterMemory;
        } else {
          updatedContent = existingContent + '\n\n## Long-term Memory\n' + memoryEntry;
        }
      } else {
        updatedContent = existingContent + '\n\n## Long-term Memory\n\nThis section contains important information that I should remember across conversations.\n' + memoryEntry;
      }

      fs.writeFileSync(contextFilePath, updatedContent, 'utf8');

      context.eventEmitter.emit({
        type: 'tool_output',
        toolName: 'save_memory',
        content: `Memory saved to ${path.basename(contextFilePath)} in category: ${category || 'General'}`
      } as ToolOutputEvent);

      return {
        success: true,
        message: 'Information successfully saved to long-term memory',
        file_path: contextFilePath,
        category: category || 'General',
        content: content,
        timestamp: timestamp
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to save memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        message: 'Could not save information to long-term memory'
      };
    }
  }
});

function getContextFilePath(): string {
  // Project context path
  const projectContextPath = path.join(process.cwd(), '.tempurai', 'directives.md');
  const projectDir = path.dirname(projectContextPath);
  if (fs.existsSync(projectDir)) {
    return projectContextPath;
  }

  // Global context path
  const globalContextPath = path.join(os.homedir(), '.tempurai', '.tempurai.md');
  const globalDir = path.dirname(globalContextPath);
  if (!fs.existsSync(globalDir)) {
    fs.mkdirSync(globalDir, { recursive: true });
  }
  return globalContextPath;
}