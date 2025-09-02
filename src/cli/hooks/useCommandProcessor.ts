import { useMemo } from 'react';
import { useTheme } from '../themes/index.js';

interface Command {
    name: string;
    description: string;
    usage: string;
}

interface CommandProcessorResult {
    isCommand: boolean;
    shouldShowHelp: boolean;
    helpContent?: string;
    processed?: boolean;
}

export const useCommandProcessor = () => {
    const { setTheme, availableThemes, themeName } = useTheme();

    const commands: Command[] = useMemo(() => [
        {
            name: 'help',
            description: 'Show available commands',
            usage: '/help'
        },
        {
            name: 'theme',
            description: 'Switch theme or list available themes',
            usage: '/theme [theme-name]'
        },
        {
            name: 'mode',
            description: 'Show current execution and edit modes',
            usage: '/mode'
        }
    ], []);

    const processCommand = (input: string): CommandProcessorResult => {
        if (!input.startsWith('/')) {
            return { isCommand: false, shouldShowHelp: false };
        }

        const parts = input.slice(1).trim().split(/\s+/);
        const commandName = parts[0].toLowerCase();
        const args = parts.slice(1);

        switch (commandName) {
            case 'help':
                return {
                    isCommand: true,
                    shouldShowHelp: true,
                    helpContent: generateHelpContent(),
                    processed: true
                };

            case 'theme':
                if (args.length === 0) {
                    return {
                        isCommand: true,
                        shouldShowHelp: true,
                        helpContent: generateThemeHelp(),
                        processed: true
                    };
                } else {
                    const targetTheme = args[0].toLowerCase();
                    if (availableThemes.includes(targetTheme as any)) {
                        setTheme(targetTheme as any);
                        return {
                            isCommand: true,
                            shouldShowHelp: true,
                            helpContent: `Theme switched to: ${targetTheme}`,
                            processed: true
                        };
                    } else {
                        return {
                            isCommand: true,
                            shouldShowHelp: true,
                            helpContent: `Unknown theme: ${targetTheme}\n\n${generateThemeHelp()}`,
                            processed: true
                        };
                    }
                }

            case 'mode':
                return {
                    isCommand: true,
                    shouldShowHelp: true,
                    helpContent: 'Use : to select execution mode, Shift+Tab to cycle edit mode',
                    processed: true
                };

            default:
                return {
                    isCommand: true,
                    shouldShowHelp: true,
                    helpContent: `Unknown command: ${commandName}\n\n${generateHelpContent()}`,
                    processed: true
                };
        }
    };

    const generateHelpContent = (): string => {
        const commandList = commands
            .map(cmd => `  ${cmd.usage.padEnd(20)} ${cmd.description}`)
            .join('\n');

        return `Available commands:\n${commandList}\n\nUse : to select execution mode\nUse Shift+Tab to cycle edit mode`;
    };

    const generateThemeHelp = (): string => {
        const themeList = availableThemes
            .map(theme => `  ${theme}${theme === themeName ? ' (current)' : ''}`)
            .join('\n');

        return `Available themes:\n${themeList}\n\nUsage: /theme <theme-name>`;
    };

    return {
        processCommand,
        commands
    };
};