# Sun calibration prototype (web-first)

This is a static browser prototype for testing:

- live rear-camera view
- sun path overlay
- current sun marker
- manual alignment by drag or nudge buttons
- skyline / obstruction tracing
- local draft export as JSON + PNG

## Files

- `index.html`
- `styles.css`
- `app.js`

## How to test

1. Upload the folder to a static host that serves over **HTTPS**.
2. Open it on a phone in a normal top-level browser tab or page.
3. Allow camera, location, and motion/orientation access.
4. Hold the phone in **portrait**.
5. Align the yellow sun marker to the real sun.
6. Lock alignment.
7. Tap along the skyline.
8. Save the draft.

## Important notes

- This is a prototype. Different phones will behave differently.
- The vertical projection is approximate and depends on the chosen FOV.
- The alignment is intentionally **session-based** rather than permanent.
- It is designed as a top-level page, not an iframe.

## Next step after testing

After field testing, the next useful step is to send the JSON draft into a review backend (Google Apps Script / Sheet or Supabase) instead of only downloading it locally.
