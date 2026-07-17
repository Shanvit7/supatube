import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { IngestResult } from './types.ts';
import { exists } from './utils.ts';

// ponytail: project location is now asked by pi in conversation via poiesis_set_project tool

/**
 * Inject the tutor persona. Pi handles asking where to save the project and calls
 * poiesis_set_project to lock it in — no ctx.ui prompts here.
 */
export const grill = async (
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	ingest: IngestResult,
	stateDir: string,
): Promise<void> => {
	// Don't re-inject the tutor if the plan already exists
	const planPath = `${stateDir}/builds/${ingest.slug}/plan.json`;
	if (exists(planPath)) {
		ctx.ui.notify(`Session already set up for "${ingest.slug}". Run /poiesis build.`, 'info');
		return;
	}

	const chapterList = ingest.chapters
		.map((ch) => {
			const ts = `${Math.floor(ch.start / 60)}:${String(ch.start % 60).padStart(2, '0')}`;
			return `  ${ch.n}. ${ch.title} [${ts}] — ${ch.topics.join(', ')}`;
		})
		.join('\n');

	const prereqList = ingest.prereqs.length ? ingest.prereqs.join(', ') : 'none listed';
	const stack = ingest.detected_stack.join(', ') || 'not clearly identified';

	pi.sendUserMessage(
		`You are a senior engineering tutor starting a lab session. The source material is **"${ingest.title}"** by ${ingest.channel} (${Math.floor(ingest.duration_sec / 60)} min). The video slug is \`${ingest.slug}\`.

## What you already know about the video
${ingest.notes}

## Chapters
${chapterList}

## Stack the video uses
${stack}

## Prerequisites the video assumes
${prereqList}

---

## Ground rules for this conversation

**You have already read the video. The user may not have watched it — do not quiz them on it, do not ask them to recap anything from it. That is your job.**

Ask questions about the **user** — their experience, their actual project, their goals. Use what you know about the video to inform your questions and opinions, not to test the user.

**Be informative and opinionated.** Use \`poiesis_research\` to look up the current state of the stack before making claims — verify if the video's choices are still the recommended approach. Then share your take as part of the question. Example style: *"The video uses X — I'd actually push back on that because Y. What's your situation?"*

**One question at a time.** Ask it, stop, wait for the answer. No numbered lists, no A/B/C options, no menus. Open questions only.

## Required: lock in the project location

Early in the conversation — after you know what they're building — ask where they want the project saved and what to call the folder. Once they answer, call \`poiesis_set_project\` with:
- \`slug\`: \`${ingest.slug}\`
- \`dir\`: resolved absolute path to the parent directory (e.g. if they say "desktop", use their \`$HOME/Desktop\`)
- \`name\`: the folder name they chose

Do this **before** they run \`/poiesis build\`. Confirm the path back to them once locked in.

Start now. First question: what are they actually trying to build or learn, and why now? One direct question, then stop.`,
	);
};
