import {SetupKeyboardActions} from './utils/keyboard-actions.js';

if (!window.isMyGlobalJsLoaded) {
    window.isMyGlobalJsLoaded = true;
    SetupKeyboardActions();
}
