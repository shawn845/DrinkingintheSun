Drinking in the Sun Admin Tool v3

What changed in v3:
- Uses the latest bundled pubs.csv included in this folder.
- Search-first pub picker instead of dumping all pubs at once.
- Auto-save local draft and restore on the same device/browser.
- Save straight to GitHub with a fine-grained personal access token.
- Still supports Download pubs.csv as a manual fallback.

How GitHub save works:
1. Fill in Owner / Repository / Branch / CSV path.
2. Enter a fine-grained GitHub token with repository Contents write permission.
3. Press Load from GitHub if you want to pull the current live CSV from the repo.
4. Edit pubs, horizon points, notes, image URLs, etc.
5. Press Save to GitHub.

Recommended CSV path:
public/data/pubs.csv

Security note:
- The token is NOT hard-coded in the tool.
- By default, the token is not remembered.
- If you tick “Remember token on this device”, it is stored in localStorage in that browser on that device.

Fallback option:
- If direct GitHub save fails for any reason, use Download pubs.csv and upload that file manually.
