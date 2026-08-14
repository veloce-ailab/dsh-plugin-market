# DSH Plugin Market

This plugin provides a Settings-native configuration editor and npm-backed plugin market for DeepSeek Harness.

Install this repository into a Web profile:

```powershell
pnpm dsh plugin --profile web add D:\dev\dsh\plugins\market
pnpm dsh web
```

Its bundle adds `dsh-plugin-market` automatically. Its `dsh.client` browser half registers **插件配置** as a first-class left-side Settings section, alongside the built-in items. The **添加插件** view queries npm for packages named `dsh-plugin*`, filters the result to that namespace, and allows a user to select an exact published version before installing it with `pnpm` into `~/.dsh/profiles/node_modules`. Scoped names in the `@scope/dsh-plugin*` namespace can be looked up by their full package name and use the same install and configuration flow.

After installation, **添加到配置** appends an inserted Loader row for the package to the active profile's user patch. It deliberately requires installation first so a saved row is always resolvable by DSH's profile module lookup. The page reloads the active profile after the patch changes.

The configuration endpoint is intentionally limited to loopback clients, even if the Web UI has been bound to a LAN address.

Saving appends one id-targeted row to the active profile's `cordis.patch.yml`. Adding a package similarly appends only its one inserted row. Existing YAML is never re-serialized, so comments and every untouched user patch stay unchanged. Clicking Save always appends an explicit patch, including when the value equals the current effective configuration.

Cordis replaces a whole `config` value for an id-targeted patch; it does not merge individual fields. The editor therefore saves the complete JSON configuration for the selected plugin. A true generic per-field patch cannot be implemented only by this plugin because the underlying Cordis patch format has no field-level operation.
