package ca.roncreator.trackmymeals;

import android.content.Context;
import android.util.AttributeSet;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.CapacitorWebView;

/**
 * Keeps the keyboard open when the keyboard itself opens a popup.
 *
 * Gboard's language list (long-press on space) is its own window, so opening
 * it takes window focus away from the app. Android System WebView (seen on
 * WebView 154 / Android 16) reacts to any window-focus loss by hiding the
 * keyboard, and hiding the keyboard closes the language list with it, so the
 * list flickers and the language can't be switched (found 2026-09-30, see
 * docs/roadmap.md, release 1.5.1).
 *
 * While the keyboard is visible, a focus loss is not passed on to the
 * WebView, and the matching focus gain afterwards is skipped too, so the
 * WebView's own idea of focus stays consistent. Every other focus change goes
 * through unchanged. Used in place of CapacitorWebView via our override of
 * res/layout/capacitor_bridge_layout_main.xml.
 */
public class KeyboardFriendlyWebView extends CapacitorWebView {

    private boolean focusLossHeldBack = false;

    public KeyboardFriendlyWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    public void onWindowFocusChanged(boolean hasWindowFocus) {
        if (!hasWindowFocus && isKeyboardVisible()) {
            focusLossHeldBack = true;
            return;
        }
        if (hasWindowFocus && focusLossHeldBack) {
            focusLossHeldBack = false;
            return;
        }
        focusLossHeldBack = false;
        super.onWindowFocusChanged(hasWindowFocus);
    }

    private boolean isKeyboardVisible() {
        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(this);
        return insets != null && insets.isVisible(WindowInsetsCompat.Type.ime());
    }
}
