# @tryopenbot/utilities

Small shared utilities without domain ownership. It currently centralizes Handlebars-based file generation so providers and CLI commands do not embed generated files as TypeScript strings.

## Public API

### Functions

- `renderFileTemplate(source, values?)` compiles a Handlebars template string with strict variable resolution and no HTML escaping.
- `renderFileTemplatePath(path, values?)` reads and renders a Handlebars template file.
- `materializeFileTemplate(sourcePath, destinationPath, values?, writeOptions?)` renders a template and writes it to disk, creating parent directories.

### Types

- `FileTemplateValues` is the read-only mapping passed to templates.

The functions are exported from both the package root and `@tryopenbot/utilities/file-template`.
