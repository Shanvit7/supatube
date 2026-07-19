import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Type } from "typebox"
import { PROFILE_PATH, needsOnboarding, runOnboarding } from "./src/onboarding.ts"
import { runProject } from "./src/project.ts"
import type { UserProfile } from "./src/types.ts"
import { writeJson } from "./src/utils.ts"

const extension = (pi: ExtensionAPI): void => {
  // ── Tool: poiesis_save_profile ────────────────────────────────────────────
  // Called by the LLM once profile data is collected (both "Sure!" and QnA paths).
  // Saves the profile and notifies the user to run /poiesis manually.
  // No auto-chaining — sendUserMessage always hits the LLM, not the command router.
  pi.registerTool({
    name: "poiesis_save_profile",
    label: "Poiesis: Save Profile",
    description: "Save the user profile once all fields are known from the conversation.",
    parameters: Type.Object({
      primaryStack: Type.Array(Type.String(), { description: "Languages and frameworks they use" }),
      experienceLevel: Type.Union([
        Type.Literal("beginner"),
        Type.Literal("intermediate"),
        Type.Literal("senior"),
      ]),
      recentProjects: Type.Array(Type.String()),
      recentActivity: Type.String({ description: "One-line summary" }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const profile: UserProfile = { ...params, scannedAt: new Date().toISOString() }
      writeJson(PROFILE_PATH, profile)
      ctx.ui.notify("✅ Profile saved — run /poiesis to start your project.", "info")
      return {
        content: [
          { type: "text" as const, text: "Profile saved. Tell the user to run /poiesis now." },
        ],
        details: {},
      }
    },
  })

  // ── /poiesis ──────────────────────────────────────────────────────────────
  pi.registerCommand("poiesis", {
    description: "Poiesis — set up profile (first run) or start a project",
    handler: async (_args, ctx) => {
      if (needsOnboarding()) {
        await runOnboarding(pi, ctx)
        return // LLM handles profile collection; user re-runs /poiesis when done
      }
      await runProject(ctx)
    },
  })
}

export default extension
