# vendor/ — Ableton Extensions SDK packages (not committed)

The Extensions SDK is a **closed beta** that may not be redistributed, so its
packages are **gitignored** (`vendor/*.tgz`) and are not present in this repo or its
history. You must supply them from your own Ableton beta access before installing.

Populate this directory from the beta bundle (`extensions-sdk-1.0.0-beta.0.zip`):

```bash
unzip extensions-sdk-1.0.0-beta.0.zip \
  ableton-extensions-sdk-1.0.0-beta.0.tgz \
  ableton-extensions-cli-1.0.0-beta.0.tgz -d vendor/
npm install
```

Expected files (referenced by `packages/send-to-sulion/package.json` via `file:`):

- `vendor/ableton-extensions-sdk-1.0.0-beta.0.tgz`
- `vendor/ableton-extensions-cli-1.0.0-beta.0.tgz`
