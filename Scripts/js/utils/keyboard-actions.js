// Pressing `Ctrl-A` select the closest `div` anchestor.
//  The `div` need to have `tabindex="0"` attribute set.
export function SetupKeyboardActions() {
    document.addEventListener('keydown', function(event) {
        if (event.key === 'a' && (event.ctrlKey || event.metaKey)) {
            const fcsdElement = document.activeElement;                         // Find the element that currently has focus.
            const closestParentDiv = fcsdElement.closest('div');                // Find the closest ancestor `div` to the focused element.
            if (closestParentDiv) {                                             // If a div was found, select its contents
                event.preventDefault();                                         // Prevent the default browser action (selecting everything).
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(closestParentDiv);
                selection.removeAllRanges();                                    // Clear any previous selection
                selection.addRange(range);                                      // Apply the new selection
            }
        }
    })
}
