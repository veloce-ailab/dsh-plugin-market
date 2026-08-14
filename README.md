# DSH Plugin Market

This first version supplies the configuration editor that the future market will use; it does not implement discovery or installation yet.

Install this repository into a Web profile:

```powershell
pnpm dsh plugin --profile web add D:\dev\dsh\plugins\market
pnpm dsh web
```

Its bundle adds `dsh-plugin-market` automatically. Its `dsh.client` browser half registers **插件配置** as a first-class left-side Settings section, alongside the built-in items. The page selects a live Loader entry and saves an explicit profile override. The form is built from Schemastery or Zod `Config` schemas; complex or unknown schemas fall back to a JSON editor.

The configuration endpoint is intentionally limited to loopback clients, even if the Web UI has been bound to a LAN address.

Saving appends one id-targeted row to the active profile's `cordis.patch.yml`. Existing YAML is never re-serialized, so comments and every untouched user patch stay unchanged. Clicking Save always appends an explicit patch, including when the value equals the current effective configuration.

Cordis replaces a whole `config` value for an id-targeted patch; it does not merge individual fields. The editor therefore saves the complete JSON configuration for the selected plugin. A true generic per-field patch cannot be implemented only by this plugin because the underlying Cordis patch format has no field-level operation.
