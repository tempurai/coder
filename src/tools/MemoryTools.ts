import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { z } from 'zod';
import { tool } from 'ai';

/**
 * Memory persistence tool
 * 允许AI将重要信息保存到.tempurai.md文件中，用于长期记忆
 */
export const saveMemoryTool = tool({
  description: `Save important information to long-term memory. Use this tool when you need to remember critical facts, preferences, or instructions that should persist across conversations. 

Examples of when to use this:
- User tells you specific project commands ("remember, our test command is npm run test:ci")
- Important project configurations or settings
- User preferences for how they like things done
- Critical facts about the project structure or architecture

IMPORTANT: Always ask for user confirmation before saving to memory, as this modifies their configuration files.`,

  inputSchema: z.object({
    content: z.string().describe('The important information to save to memory'),
    category: z.string().optional().describe('Optional category/section for organizing the memory (e.g., "Commands", "Preferences", "Project Info")'),
    ask_permission: z.boolean().default(true).describe('Whether to ask for user permission before saving (default: true)')
  }),

  execute: async ({ content, category, ask_permission }) => {
    console.log('🧠 Memory save request:');
    console.log(`   Content: ${content}`);
    console.log(`   Category: ${category || 'General'}`);
    
    if (ask_permission) {
      console.log('\n📝 I would like to save this information to your long-term memory (.tempurai.md file).');
      console.log('This will help me remember this information in future conversations.');
      console.log('\nWould you like me to proceed? (This is a simulation - in real implementation, this would wait for user confirmation)');
      
      // In a real implementation, this would pause and wait for user input
      // For now, we'll simulate user approval
      console.log('✅ Simulating user approval...');
    }

    try {
      const contextFilePath = getContextFilePath();
      const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      
      // Prepare the memory entry
      const categoryHeader = category ? `### ${category}` : '### Saved Memories';
      const memoryEntry = `\n${categoryHeader}\n\n**Added on ${timestamp}:**\n${content}\n`;
      
      // Read existing content or create new
      let existingContent = '';
      if (fs.existsSync(contextFilePath)) {
        existingContent = fs.readFileSync(contextFilePath, 'utf8');
      }
      
      // Check if the Saved Memories section already exists
      const memoriesSectionExists = existingContent.includes('## Long-term Memory');
      
      let updatedContent: string;
      if (memoriesSectionExists) {
        // Find the Long-term Memory section and append to it
        const memorySectionRegex = /(## Long-term Memory.*?)(\n## |$)/s;
        const match = existingContent.match(memorySectionRegex);
        
        if (match) {
          const beforeMemory = existingContent.substring(0, match.index);
          const memorySection = match[1];
          const afterMemory = existingContent.substring(match.index! + match[1].length);
          
          updatedContent = beforeMemory + memorySection + memoryEntry + afterMemory;
        } else {
          // Fallback: append at the end
          updatedContent = existingContent + '\n\n## Long-term Memory\n' + memoryEntry;
        }
      } else {
        // Add a new Long-term Memory section
        updatedContent = existingContent + '\n\n## Long-term Memory\n\nThis section contains important information that I should remember across conversations.\n' + memoryEntry;
      }
      
      // Write the updated content
      fs.writeFileSync(contextFilePath, updatedContent, 'utf8');
      
      console.log(`✅ Memory saved to ${contextFilePath}`);
      
      return {
        success: true,
        message: 'Information successfully saved to long-term memory',
        file_path: contextFilePath,
        category: category || 'General',
        content: content,
        timestamp: timestamp
      };
      
    } catch (error) {
      console.error('❌ Failed to save memory:', error);
      return {
        success: false,
        error: `Failed to save memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        message: 'Could not save information to long-term memory'
      };
    }
  }
});

/**
 * Get the appropriate context file path
 * Prefers project-local .tempurai/directives.md, falls back to global ~/.tempurai/.tempurai.md
 */
function getContextFilePath(): string {
  // First check for project-local context file
  const projectContextPath = path.join(process.cwd(), '.tempurai', 'directives.md');
  const projectDir = path.dirname(projectContextPath);
  
  if (fs.existsSync(projectDir)) {
    return projectContextPath;
  }
  
  // Fall back to global context file
  const globalContextPath = path.join(os.homedir(), '.tempurai', '.tempurai.md');
  const globalDir = path.dirname(globalContextPath);
  
  // Ensure the global directory exists
  if (!fs.existsSync(globalDir)) {
    fs.mkdirSync(globalDir, { recursive: true });
  }
  
  return globalContextPath;
}