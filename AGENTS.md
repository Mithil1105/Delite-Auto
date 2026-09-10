# Project rules

## Documentation rule (mandatory)

For every new feature or change implemented in this project:

1. Create or update a Markdown file for that feature inside the `Documentations MD/` folder,
   following the shared structure in `Documentations MD/template.md`. Do not invent a different
   layout — copy the template so every doc stays consistent.
2. Update `Documentations MD/index.md`:
   - Add or update the row for that file in the index table (feature, branch, status, last
     updated).
   - Add an entry to the revision log at the bottom of `index.md` describing the change.
3. Update the "Last updated" field and the per-file revision log inside the feature's own doc
   file whenever it's touched again.

This documentation is written for two audiences: human engineers reviewing the work, and AI
assistants/reviewers picking up context later. Write it so both can understand the feature and
its history without reading the full diff or git log.

This applies to every feature/change going forward — do it as part of the work, not as an
afterthought at the end.
