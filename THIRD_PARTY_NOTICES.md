# Third-party notices

This distribution includes the following runtime components. Their upstream license texts are included in `licenses/`.

| Component | Version | Source | License |
| --- | --- | --- | --- |
| web-tree-sitter | 0.20.8 | https://github.com/tree-sitter/tree-sitter | MIT |
| sql.js | 1.13.0 | https://github.com/sql-js/sql.js | MIT |
| tree-sitter-wasms (Python / HTML binaries) | 0.1.13 | https://github.com/Gregoor/tree-sitter-wasms | Unlicense (packaging); grammar licenses below |
| tree-sitter-python grammar | WASM from tree-sitter-wasms | https://github.com/tree-sitter/tree-sitter-python | MIT |
| tree-sitter-html grammar | WASM from tree-sitter-wasms | https://github.com/tree-sitter/tree-sitter-html | MIT |

SQLite is in the public domain. Only the Python and HTML grammar binaries are distributed. Build-only dependencies are not included in the extension runtime.
