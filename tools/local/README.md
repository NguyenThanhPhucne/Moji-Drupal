# Local Debug Scripts

This folder is for one-off local troubleshooting scripts.

Rules:
- Scripts in this folder are intentionally not tracked by Git.
- Keep only this README tracked so the team knows the workflow.
- Do not move these scripts back into `backend/` root.

How to use:
1. Copy or create script files in `tools/local/`.
2. Run them from repository root, for example:
   - `node tools/local/check-user.js`
   - `bash tools/local/debug_friends_page.sh`
3. Remove or update scripts after finishing local troubleshooting.

Notes:
- Maintained operational script stays in source control: `backend/scripts/db-health-check.mjs`.
- If a local script becomes stable and reusable, move it into a proper tracked folder (for example `backend/scripts/`) with review.
