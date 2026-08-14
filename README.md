# DSH Plugin Market

This plugin provides a Settings-native configuration editor and npm-backed plugin market for DeepSeek Harness.

Install this repository into a Web profile:

```powershell
pnpm dsh plugin --profile web add D:\dev\dsh\plugins\market
pnpm dsh web
```

Its bundle adds `dsh-plugin-market` automatically. Its `dsh.client` browser half registers **插件配置** as a first-class left-side Settings section, alongside the built-in items. The **添加插件** view queries npm for packages named `dsh-*`, filters the result to importable packages, and allows a user to select an exact published version before running `dsh plugin --profile web add <package>@<version>`. Scoped names in the `@scope/dsh-*` namespace can be looked up by their full package name and use the same install and configuration flow. A package that declares a DSH bundle is activated by the profile manifest after installation and therefore has no separate Loader-row action.

The **GitHub 精选** view reads the stars, npm mapping, and added-date data published by [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/tree/main/data). Its install action runs `dsh plugin --profile web add github:<owner>/<repo>` for the selected repository. When DSH records a package name for that installation, the page also offers **添加到配置**; bundle packages remain activated by DSH's profile manifest without an extra Loader row.

The **卸载插件** view lists direct Web-profile dependencies that are DSH-namespaced packages or bundles. Its detail dialog removes a selected package through `dsh plugin --profile web remove <package>`, allowing DSH to update both dependencies and the bundle stack.

After installation, **添加到配置** appends an inserted Loader row for the package to the active profile's user patch. It deliberately requires installation first so a saved row is always resolvable by DSH's profile module lookup. The page reloads the active profile after the patch changes.

The configuration endpoint is intentionally limited to loopback clients, even if the Web UI has been bound to a LAN address.

Saving appends one id-targeted row to the active profile's `cordis.patch.yml`. Adding a package similarly appends only its one inserted row. Existing YAML is never re-serialized, so comments and every untouched user patch stay unchanged. Clicking Save always appends an explicit patch, including when the value equals the current effective configuration.

Cordis replaces a whole `config` value for an id-targeted patch; it does not merge individual fields. The editor therefore saves the complete JSON configuration for the selected plugin. A true generic per-field patch cannot be implemented only by this plugin because the underlying Cordis patch format has no field-level operation.
