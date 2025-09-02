import { useState, useCallback } from 'react';

type InputMode = 'normal' | 'command' | 'execution' | 'help';

interface InputModeManager {
    currentMode: InputMode;
    setMode: (mode: InputMode) => void;
    isPanelMode: boolean;
    isNormalMode: boolean;
}

export const useInputModeManager = (): InputModeManager => {
    const [currentMode, setCurrentMode] = useState<InputMode>('normal');

    const setMode = useCallback((mode: InputMode) => {
        setCurrentMode(mode);
    }, []);

    const isPanelMode = currentMode !== 'normal';
    const isNormalMode = currentMode === 'normal';

    return {
        currentMode,
        setMode,
        isPanelMode,
        isNormalMode
    };
};