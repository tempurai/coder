import { create } from 'zustand';
import { ExecutionMode } from '../../services/ExecutionModeManager.js';

export type PanelMode = 'COMMAND_PALETTE' | 'EXECUTION_MODE' | 'HELP' | 'THEME';
export type ActivePanel = 'INPUT' | 'CONFIRMATION' | PanelMode;

interface UiState {
    executionMode: ExecutionMode;
    activePanel: ActivePanel;
    actions: {
        setExecutionMode: (mode: ExecutionMode) => void;
        setActivePanel: (panel: ActivePanel) => void;
    };
}

export const useUiStore = create<UiState>((set) => ({
    executionMode: ExecutionMode.CODE,
    activePanel: 'INPUT',
    actions: {
        setExecutionMode: (mode) => set({ executionMode: mode }),
        setActivePanel: (panel) => set({ activePanel: panel }),
    },
}));