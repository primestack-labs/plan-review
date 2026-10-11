# Privacy

plan-review runs on your machine and keeps the review there.

- **No personal data.** The plugin reads the plan file you name and writes review artifacts under `~/.claude/plan-review/`. It does not read names, emails, addresses or any account data.
- **Nothing is sent to us.** There is no telemetry, no analytics, no external API and no server of ours. Comments, approvals, decisions and audio stay on your disk.
- **What leaves the machine.** Three downloads, all one-way fetches: the Kokoro packages from the npm registry and the Kokoro model from Hugging Face, both on first use when the Kokoro engine is selected, and the mermaid, marked and highlight.js libraries from cdnjs.cloudflare.com when the review page opens. Each download sends only the ordinary HTTP request for the file.
- **No credentials.** The plugin does not read tokens, keys or passwords from your environment, your keychain or your files.
- **Retention.** Nothing is retained by us because nothing reaches us. Review folders under `~/.claude/plan-review/` stay until you delete them.

Questions: https://github.com/primestack-labs/plan-review/issues
