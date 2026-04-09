Drinking in the Sun Admin Tool

What it does
- Loads pubs.csv from ./public/data/pubs.csv or ./pubs.csv if present.
- Lets you edit the current CSV fields on phone or desktop.
- Lets you enter Solar Surveyor skyline points for Spot A and Spot B as azimuth/elevation pairs.
- Builds the horizon string automatically.
- Shows a live graph preview of the skyline profile and the sun path for the chosen date.
- Calculates the predicted sun window using the same solar maths direction as the current app.
- Exports a fresh pubs.csv for you to upload to GitHub.

How to use
1. Upload the whole folder or the files into your repo, for example /admin/.
2. Open admin/index.html in the browser.
3. If it does not auto-load your CSV, use Load CSV.
4. Edit rows, add horizon points, and download pubs.csv.
5. Replace public/data/pubs.csv in the repo with the downloaded file.

Notes
- This is a static tool. It does not write directly to GitHub from the browser.
- The skyline preview uses bounded horizon logic: outside the first and last point, the seat is treated as blocked.
- Unknown CSV columns are preserved when you load and re-export the file.
