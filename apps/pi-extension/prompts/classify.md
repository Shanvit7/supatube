# Chapter {{chapterNum}} — Classify first

Before doing anything else, decide whether this chapter is **code** or **theory**:

- **code** — the student will write and run code as part of this chapter (even if it also
  explains concepts). Anything with a runnable artefact.
- **theory** — purely conceptual. No runnable output, no test file, no commands to execute.

The chapter markdown is already in your system context under **Current chapter content**.
Read it, decide, then call the tool. Do not narrate your reasoning to the student — this
is a routing step. If it's genuinely ambiguous or mixed, lean **code**.

Call `poiesis_chapter_classify` with `{ kind: "code" | "theory" }`. That tool will hand you
the correct next-step prompt.
