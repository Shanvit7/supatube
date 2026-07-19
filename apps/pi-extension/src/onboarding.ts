/**
 * First-run onboarding.
 *
 * "Sure!" → inject scan prompt → return immediately (false)
 *           LLM scans + calls poiesis_save_profile
 *           poiesis_save_profile queues '/poiesis' as followUp
 *           '/poiesis' fires in fresh context → needsOnboarding=false → runProject
 *
 * "No"    → inject QnA prompt → return immediately (false)
 *           same chain: LLM chats → poiesis_save_profile → followUp → runProject
 */
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent"
import { exists } from "./utils.ts"

export const PROFILE_PATH = "~/.poiesis/user-profile.json"

export const needsOnboarding = (): boolean => !exists(PROFILE_PATH)

export const runOnboarding = async (
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext
): Promise<void> => {
  const pick = await ctx.ui.select(
    "Mind if I sneak a peek at your GitHub repos and local folders? I won't read any code.",
    ["Sure!", "No, ask me instead"]
  )

  if (pick === "Sure!") {
    await pi.sendUserMessage(
      `Run \`gh repo list --limit 50 --json name,primaryLanguage,updatedAt\` and list directory names (not contents) in ~/Desktop, ~/projects, ~/dev, ~/code.

From what you find, call \`poiesis_save_profile\` with:
- primaryStack: top languages you see
- experienceLevel: "beginner" | "intermediate" | "senior"
- recentProjects: up to 8 repo/dir names
- recentActivity: one-line summary

Call the tool immediately once you have enough data. No summary, no greeting. After calling the tool, tell the user to run /poiesis.`
    )
    return
  }

  // Multi-turn QnA path — same tail: LLM calls poiesis_save_profile → followUp → runProject
  await pi.sendUserMessage(
    `Ask the user about themselves — one question at a time, casual tone. Find out:
- primaryStack (languages/frameworks they build with)
- experienceLevel ("beginner" | "intermediate" | "senior")
- recentProjects (a few project names if they mention any)
- recentActivity (one-line summary of what they've been building)

Once you have enough, call \`poiesis_save_profile\`. No sign-off after saving.`
  )
}
