import { create } from 'zustand';
import { ExecutionMode } from '../../services/ExecutionModeManager.js';

export type PanelMode = 'COMMAND_PALETTE' | 'EXECUTION_MODE' | 'HELP' | 'THEME';
export type ActivePanel = 'INPUT' | 'CONFIRMATION' | PanelMode;

interface UiState {
    executionMode: ExecutionMode;
    activePanel: ActivePanel;
    initialInputValue: string | null; // 新增状态
    actions: {
        setExecutionMode: (mode: ExecutionMode) => void;
        // 接收可选的初始值
        setActivePanel: (panel: ActivePanel, initialValue?: string) => void;
    };
}

export const useUiStore = create<UiState>((set) => ({
    executionMode: ExecutionMode.CODE,
    activePanel: 'INPUT',
    initialInputValue: null, // 初始化
    actions: {
        setExecutionMode: (mode) => set({ executionMode: mode }),
        // 实现新的 action 逻辑
        setActivePanel: (panel, initialValue) =>
            set({
                activePanel: panel,
                initialInputValue: initialValue ?? null
            }),
    },
}));