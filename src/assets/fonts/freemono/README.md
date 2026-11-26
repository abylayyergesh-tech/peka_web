# FreeMono Bold (subset)

The receipt font for the iiko-like variants (`src/components/printReceipt.ts`). It looks like Courier New, which the old iiko receipts were printed in. Courier New itself is not available on every kassa PC, so this copy ships with the site.

- **Source:** GNU FreeFont 20120503, `FreeMonoBold.otf`, from https://ftp.gnu.org/gnu/freefont/freefont-otf-20120503.tar.gz (sha256 `3a6c51868c71b006c33c4bcde63d90927e6fcca8f51c965b8ad62d021614a860`).
- **Modification:** subset to Latin, Cyrillic (including Kazakh letters), dashes, quotes, `№` and `₸`, and converted to WOFF2:

  ```
  pyftsubset FreeMonoBold.otf \
    --unicodes="U+0020-007E,U+00A0-00FF,U+0400-045F,U+0490-0491,U+0492-04FF,U+2010-2027,U+2116,U+20B8" \
    --flavor=woff2 --layout-features='' --output-file=freemono-bold.woff2
  ```

- **License:** GNU GPL v3 or later, with the font exception: embedding the font in a document does not by itself put that document under the GPL. The full text is at https://www.gnu.org/licenses/gpl-3.0.html. The exception is in the FreeFont README.
