// Reviewed CLI forms; scoped autonomy and offline evaluations retain their separate authority boundaries.
export default [
  {
    "id": "cli.autonomy",
    "command": "autonomy",
    "usage": "plates autonomy [--level <low|medium|high> | --mode <default|local|delivery>] [--push <branch>] [--push-prefix <namespace/>] [--merge <branch>] [--yes --digest <sha256>] [--json]",
    "summary": "inspect or explicitly select bounded project autonomy",
    "source": {
      "file": "lib/cli.mjs",
      "line": 157,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "none",
        "arguments": [
          {
            "token": "--level",
            "arity": 1,
            "repeat": "once",
            "treatment": "limited"
          },
          {
            "token": "--mode",
            "arity": 1,
            "repeat": "once",
            "treatment": "limited"
          },
          {
            "token": "--push",
            "arity": 1,
            "repeat": "repeatable",
            "treatment": "limited"
          },
          {
            "token": "--push-prefix",
            "arity": 1,
            "repeat": "repeatable",
            "treatment": "limited"
          },
          {
            "token": "--merge",
            "arity": 1,
            "repeat": "repeatable",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "once",
            "treatment": "limited"
          },
          {
            "token": "--digest",
            "arity": 1,
            "repeat": "once",
            "treatment": "limited"
          },
          {
            "token": "--json",
            "arity": 0,
            "repeat": "once",
            "treatment": "presentation-only"
          }
        ],
        "constraints": "Read-only without --level or its legacy --mode alias; the flags cannot be combined. Low=default, Medium=local, High=delivery. Selection requires explicit level plus reviewed --yes --digest; lists replace prior scope. Push namespaces require current target-bound protection evidence and exclude protected/default branches. No wildcard/refspec, host consent or merge-gate bypass.",
        "parserSource": "lib/autonomy-cli.mjs"
      }
    ],
    "limitation": "Local project selection and supported agent context only. Project Home displays source declarations; host approval controls have no authenticated adapter and remain unavailable.",
    "followUp": "In the intended checkout, run plates autonomy --json, preview the desired Low, Medium or High scope, then explicitly confirm the returned digest. Existing host, merge, deployment and security gates remain in force."
  },
  {
    "id": "cli.migrate",
    "command": "migrate",
    "usage": "plates migrate [root] [--yes --digest <sha256>] [--json]",
    "summary": "preview the Keel-to-Plates file migration; --yes applies the reviewed digest",
    "source": {
      "file": "lib/cli.mjs",
      "line": 174,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "project-root:0..1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "dispatcher presentation flag",
            "treatment": "presentation-only"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "once",
            "treatment": "limited"
          },
          {
            "token": "--digest",
            "arity": 1,
            "repeat": "once",
            "treatment": "limited"
          }
        ],
        "constraints": "Default root is the current directory. --yes and --digest must be supplied together; digest is the exact lowercase 64-character SHA-256 preview digest. Duplicate approval flags, unknown flags and extra roots are refused before reading the root. Preview does not apply the migration.",
        "parserSource": "lib/rename.mjs"
      }
    ],
    "limitation": "Local checkout migration only; the web service cannot rename files, remotes or repositories through this catalogue.",
    "followUp": "Run plates migrate in the intended checkout, review its exact file plan, then approve that plan with paired --yes and --digest; retain the recovery journal after uncertainty."
  },
  {
    "id": "cli.names",
    "command": "names",
    "usage": "plates names [--repo <owner/name>] [--only <row>]... [--yes --digest <sha256>] | --recover <operation> | --machine | --verify <repo> [--run <id>] [--json]",
    "summary": "preview exact external names; approved single-repository apply, recovery and verification",
    "source": {
      "file": "lib/cli.mjs",
      "line": 165,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "none",
        "arguments": [
          {
            "token": "--repo",
            "arity": 1,
            "repeat": "once",
            "treatment": "limited"
          },
          {
            "token": "--only",
            "arity": 1,
            "repeat": "repeatable exact row",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "once",
            "treatment": "limited"
          },
          {
            "token": "--digest",
            "arity": 1,
            "repeat": "once",
            "treatment": "limited"
          },
          {
            "token": "--recover",
            "arity": 1,
            "repeat": "once",
            "treatment": "limited"
          },
          {
            "token": "--machine",
            "arity": 0,
            "repeat": "once",
            "treatment": "limited"
          },
          {
            "token": "--verify",
            "arity": 1,
            "repeat": "once",
            "treatment": "limited"
          },
          {
            "token": "--run",
            "arity": 1,
            "repeat": "once",
            "treatment": "limited"
          },
          {
            "token": "--morning-run",
            "arity": 1,
            "repeat": "once",
            "treatment": "limited"
          },
          {
            "token": "--json",
            "arity": 0,
            "repeat": "dispatcher presentation flag",
            "treatment": "presentation-only"
          }
        ],
        "constraints": "Preview is read-only. Apply requires paired --yes and exact --digest with one --repo or separate --machine scope. Recovery cannot combine with approval or repository selection. Verification is separate and accepts optional positive --run. Unknown or duplicate nonrepeatable arguments are refused. Uncertain operations retain original identities; recovery never resends.",
        "parserSource": "lib/names-cli.mjs"
      }
    ],
    "limitation": "CLI-only migration; no hosted executor, permission grant, fleet activation, secret read, receipt publication, or workflow dispatch. Missing rollout evidence remains unknown.",
    "followUp": "Run the preview in the intended checkout, review exact single-project actions and owner secret commands, then explicitly approve its digest. Machine changes require separate approval. Retain original recovery intents; publish receipts through a separately reviewed change and verify the dispatched rollout."
  },
  {
    "id": "cli.evidence-rederive",
    "command": "evidence rederive",
    "usage": "plates evidence rederive <phase> [--yes] [--json]",
    "summary": "preview dated measurement records; --yes reruns their argument arrays",
    "source": {
      "file": "lib/cli.mjs",
      "line": 182,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "phase:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add immutable named measurement preview and bounded worker for its argv, followed by reviewed evidence update."
  },
  {
    "id": "cli.status",
    "command": "status",
    "usage": "plates status [--project <p>] [--json]",
    "summary": "goals with built and lived-in counts, and the next phase",
    "source": {
      "file": "lib/cli.mjs",
      "line": 191,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--project",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "Bounded source-derived project summary; local checkout state and CLI project-name selector are not identical.",
    "followUp": "Expose goal/phase coverage and unavailable local-only sources."
  },
  {
    "id": "cli.next",
    "command": "next",
    "usage": "plates next [--project <p>] [--json]",
    "summary": "the next phase to conduct, its done-when and next action; every ready phase, free or claimed (it fetches)",
    "source": {
      "file": "lib/cli.mjs",
      "line": 220,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--project",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "Board next actions; no local worktree claim/fetch parity.",
    "followUp": "Add dedicated ready-phase detail and claim capability before claiming full parity."
  },
  {
    "id": "cli.goal-list",
    "command": "goal list",
    "usage": "plates goal list [--json]",
    "summary": "every goal, with progress derived from its phases",
    "source": {
      "file": "lib/cli.mjs",
      "line": 247,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "Home progress is not a full goals catalogue.",
    "followUp": "Add source-bound goals list/detail."
  },
  {
    "id": "cli.goal-show",
    "command": "goal show",
    "usage": "plates goal show <id> [--json]",
    "summary": "one goal: its phases, built and lived-in counts, and its next phase",
    "source": {
      "file": "lib/cli.mjs",
      "line": 256,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "id:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "Project summary is not goal detail.",
    "followUp": "Add goal route with phases and source gaps."
  },
  {
    "id": "cli.goal-add",
    "command": "goal add",
    "usage": "plates goal add \"<title>\" --outcome \"<one sentence>\" [--json]",
    "summary": "add a goal (the next free G<n>) to docs/goals.json; regenerate the roadmap",
    "source": {
      "file": "lib/cli.mjs",
      "line": 265,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "title:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--outcome",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add source-bound preview and conditional Git writer for goals plus generated roadmap."
  },
  {
    "id": "cli.goal-retire",
    "command": "goal retire",
    "usage": "plates goal retire <id> --reason \"<why>\" [--phases supersede|move:<Gm>] [--yes] [--json]",
    "summary": "retire a goal with a reason; its unbuilt phases are superseded or moved (--yes)",
    "source": {
      "file": "lib/cli.mjs",
      "line": 275,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "id:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--reason",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--phases",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add reviewed retirement/move/supersede writer with exact affected phases."
  },
  {
    "id": "cli.phase-new",
    "command": "phase new",
    "usage": "plates phase new \"<title>\" --goal <id> [--depends 1,2] [--json]",
    "summary": "scaffold the next free phase number from the template, under a goal",
    "source": {
      "file": "lib/cli.mjs",
      "line": 285,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "title:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--goal",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--depends",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add conditional phase scaffold and generated roadmap writer."
  },
  {
    "id": "cli.phase-claim",
    "command": "phase claim",
    "usage": "plates phase claim <n> [--provider <name>] [--token <t>] [--release] [--json]",
    "summary": "claim a phase before building it: one shared create-only branch, claims/phase-<n>; --release gives it back",
    "source": {
      "file": "lib/cli.mjs",
      "line": 295,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "phase:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--release",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--provider",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--token",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Implement durable claim/release with exact shared branch ownership and token checks."
  },
  {
    "id": "cli.ready",
    "command": "ready",
    "usage": "plates ready [--branch <name>] [--check \"<cmd>\"]... [--json]",
    "summary": "hand a committed change off: run only its fast checks, push its branch and ready/<branch>; never the full gate",
    "source": {
      "file": "lib/cli.mjs",
      "line": 305,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--branch",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--check",
            "arity": 1,
            "repeat": "explicitly repeatable",
            "treatment": "limited"
          }
        ],
        "constraints": "--check repeated; command strings are local execution, never a web shell request.",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Requires an enrolled checkout and bounded approved check adapter; never accept arbitrary shell through browser."
  },
  {
    "id": "cli.integrate",
    "command": "integrate",
    "usage": "plates integrate [--json]",
    "summary": "one integrator (lock claims/integrate): merge every ready change, run the full gate once, push; a failing change is found and sent back",
    "source": {
      "file": "lib/cli.mjs",
      "line": 321,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Requires single-integrator authority, isolated merge/check execution and durable publication receipts."
  },
  {
    "id": "cli.phase-list",
    "command": "phase list",
    "usage": "plates phase list [--json]",
    "summary": "every phase, as the roadmap reads it",
    "source": {
      "file": "lib/cli.mjs",
      "line": 329,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add complete bounded phase catalogue and coverage, beyond Home summary."
  },
  {
    "id": "cli.render",
    "command": "render",
    "usage": "plates render [--check] [--into <dir>] [--json]",
    "summary": "render the project's practices onto it; --check writes nothing",
    "source": {
      "file": "lib/cli.mjs",
      "line": 340,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--check",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--into",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add source-bound render preview and approved conditional patch writer; local --into remains local."
  },
  {
    "id": "cli.init",
    "command": "init",
    "usage": "plates init [dir] --description \"<paragraph>\" [--name <n>] [--tagline <t>] [--kind static|node|web|other] [--repo owner/name] [--guide <path>] [--with <practice>]... [--github [--yes]] [--json]",
    "summary": "a new project in an empty directory: practice, goal G0, phase 0, one commit",
    "source": {
      "file": "lib/cli.mjs",
      "line": 364,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "directory:0..1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--github",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--description",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--name",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--tagline",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--kind",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--repo",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--guide",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--with",
            "arity": 1,
            "repeat": "explicitly repeatable",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Design explicit project creation/adoption workflow with resource approvals; local directory not remotely available."
  },
  {
    "id": "cli.adopt",
    "command": "adopt",
    "usage": "plates adopt [dir] [--dry-run] [--guide <path>] [--check \"<command>\"] [--setup \"<command>\"] [--env KEY=VALUE]... [--with <practice>]... [--json]",
    "summary": "bring an existing project under plates; on only what it already satisfies, the rest local",
    "source": {
      "file": "lib/cli.mjs",
      "line": 380,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "directory:0..1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--dry-run",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--guide",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--check",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--setup",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--env",
            "arity": 1,
            "repeat": "explicitly repeatable",
            "treatment": "limited"
          },
          {
            "token": "--with",
            "arity": 1,
            "repeat": "explicitly repeatable",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Design exact adoption proposal from source and explicit setup/check approval; local directories remain unsupported."
  },
  {
    "id": "cli.doctor",
    "command": "doctor",
    "usage": "plates doctor [--github] [--fix <path> restore|eject [--yes]] [--json]",
    "summary": "what the project changed of the practice, and practice rules broken; changes nothing without --fix",
    "source": {
      "file": "lib/cli.mjs",
      "line": 400,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--github",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--fix",
            "arity": "2",
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "--fix consumes path then restore|eject; --yes authorizes that repair.",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add bounded diagnosis and exact restore/eject preview; do not overwrite user drift."
  },
  {
    "id": "cli.update",
    "command": "update",
    "usage": "plates update [dir] [--local] [--yes] [--no-self-update] [--json]",
    "summary": "the CLI first, then migrations, re-render, check; one branch for a PR (--local: a diff)",
    "source": {
      "file": "lib/cli.mjs",
      "line": 415,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "directory:0..1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--local",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--no-self-update",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "--local and --yes conflict.",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "Supported adopter update preparation and separately reviewed PR publication only; no --local/self CLI replacement.",
    "followUp": "Expose precise eligibility and unsupported local/self-update modes."
  },
  {
    "id": "cli.lessons",
    "command": "lessons",
    "usage": "plates lessons [--dry-run] [--yes] [--to owner/repo] [--since <ref>] [--json]",
    "summary": "send new lessons, drift and practice commits home to plates as issues, once each",
    "source": {
      "file": "lib/cli.mjs",
      "line": 431,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--dry-run",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--to",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--since",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "Shared catalogue is not issue-based lesson submission to upstream.",
    "followUp": "Design exact reviewed outbound lesson publication and original-receipt recovery."
  },
  {
    "id": "cli.learn",
    "command": "learn",
    "usage": "plates learn [evaluate inspect|package|propose|plan|decide|follow-up <slug> [--input <absolute-request.json>] [--manifest <absolute-file>] [--state <absolute-dir>] [--yes --digest <digest>] | propose <slug|issue#> --outcome lesson|practice|decline|link --note \"<line>\" --read \"<read>\" [--link <n>] [--yes] | decide <slug|issue#> accepted|declined [--note \"<why>\"] [--shape \"…\" --cost \"…\" --guard \"…\"] [--yes] | render [--check] | distill [propose --kind family|reword|tag|standardise … --read \"<read>\"]] [--json]",
    "summary": "plates only: gather lesson issues and moved sources into docs/inbox/; propose (agent), decide (person), render, distill (lessons into patterns)",
    "source": {
      "file": "lib/cli.mjs",
      "line": 441,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      },
      {
        "subcommand": "propose",
        "positionals": "slug-or-issue:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--outcome",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--note",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--read",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--link",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      },
      {
        "subcommand": "decide",
        "positionals": "slug-or-issue:1 decision:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--note",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--shape",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--cost",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--guard",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      },
      {
        "subcommand": "render",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--check",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      },
      {
        "subcommand": "distill",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      },
      {
        "subcommand": "distill propose",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--migration",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--kind",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--name",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--rule",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--guard",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--rows",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--row",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--shape",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--cost",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--where",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--evidence",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--family",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--check",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--practice",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--note",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--read",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      },
      {
        "subcommand": "evaluate inspect",
        "positionals": "slug:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "rejected",
            "treatment": "presentation-only"
          }
        ],
        "constraints": "Local evaluated-learning records only; no execution or promotion.",
        "parserSource": "lib/evaluated-learning.mjs"
      },
      {
        "subcommand": "evaluate propose",
        "positionals": "slug:1",
        "arguments": [
          {
            "token": "--input",
            "arity": 1,
            "repeat": "rejected",
            "treatment": "limited"
          },
          {
            "token": "--manifest",
            "arity": 1,
            "repeat": "rejected",
            "treatment": "limited"
          },
          {
            "token": "--state",
            "arity": 1,
            "repeat": "rejected",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "rejected",
            "treatment": "limited"
          },
          {
            "token": "--digest",
            "arity": 1,
            "repeat": "rejected",
            "treatment": "limited"
          },
          {
            "token": "--json",
            "arity": 0,
            "repeat": "rejected",
            "treatment": "presentation-only"
          }
        ],
        "constraints": "Local evaluated-learning records only; no execution or promotion.",
        "parserSource": "lib/evaluated-learning.mjs"
      },
      {
        "subcommand": "evaluate plan",
        "positionals": "slug:1",
        "arguments": [
          {
            "token": "--input",
            "arity": 1,
            "repeat": "rejected",
            "treatment": "limited"
          },
          {
            "token": "--manifest",
            "arity": 1,
            "repeat": "rejected",
            "treatment": "limited"
          },
          {
            "token": "--state",
            "arity": 1,
            "repeat": "rejected",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "rejected",
            "treatment": "limited"
          },
          {
            "token": "--digest",
            "arity": 1,
            "repeat": "rejected",
            "treatment": "limited"
          },
          {
            "token": "--json",
            "arity": 0,
            "repeat": "rejected",
            "treatment": "presentation-only"
          }
        ],
        "constraints": "Local binding and preregistered screening only; nonnull criteria require no prior execution. No execution or promotion.",
        "parserSource": "lib/evaluated-learning.mjs"
      },
      {
        "subcommand": "evaluate decide",
        "positionals": "slug:1",
        "arguments": [
          {
            "token": "--input",
            "arity": 1,
            "repeat": "rejected",
            "treatment": "limited"
          },
          {
            "token": "--manifest",
            "arity": 1,
            "repeat": "rejected",
            "treatment": "limited"
          },
          {
            "token": "--state",
            "arity": 1,
            "repeat": "rejected",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "rejected",
            "treatment": "limited"
          },
          {
            "token": "--digest",
            "arity": 1,
            "repeat": "rejected",
            "treatment": "limited"
          },
          {
            "token": "--json",
            "arity": 0,
            "repeat": "rejected",
            "treatment": "presentation-only"
          }
        ],
        "constraints": "Local screening, exact review-package recording, rejection and dormant promotion/rollback observations. Missing provider/routing support blocks readiness; no external writes or installation.",
        "parserSource": "lib/evaluated-learning.mjs"
      },
      {
        "subcommand": "evaluate follow-up",
        "positionals": "slug:1",
        "arguments": [
          {
            "token": "--input",
            "arity": 1,
            "repeat": "rejected",
            "treatment": "limited"
          },
          {
            "token": "--manifest",
            "arity": 1,
            "repeat": "rejected",
            "treatment": "limited"
          },
          {
            "token": "--state",
            "arity": 1,
            "repeat": "rejected",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "rejected",
            "treatment": "limited"
          },
          {
            "token": "--digest",
            "arity": 1,
            "repeat": "rejected",
            "treatment": "limited"
          },
          {
            "token": "--json",
            "arity": 0,
            "repeat": "rejected",
            "treatment": "presentation-only"
          }
        ],
        "constraints": "Explicit attributed follow-up; source set coverage only, eligible exposure and outcome/resource changes remain unknown. No polling or automatic reopening.",
        "parserSource": "lib/evaluated-learning.mjs"
      },
      {
        "subcommand": "evaluate package",
        "positionals": "slug:1",
        "arguments": [
          {
            "token": "--manifest",
            "arity": 1,
            "repeat": "rejected",
            "treatment": "limited"
          },
          {
            "token": "--state",
            "arity": 1,
            "repeat": "rejected",
            "treatment": "limited"
          },
          {
            "token": "--json",
            "arity": 0,
            "repeat": "rejected",
            "treatment": "presentation-only"
          }
        ],
        "constraints": "Read-only deterministic public package from original verified report and mapping; no caller report or readiness flags, no files written.",
        "parserSource": "lib/evaluated-learning.mjs"
      }
    ],
    "limitation": "Private shared catalogue/migration/export differs from mothership inbox gathering/proposal/decision/distillation.",
    "followUp": "Add separate source-owned inbox workflow; do not label catalogue as CLI learn."
  },
  {
    "id": "cli.improve",
    "command": "improve",
    "usage": "plates improve [--sessions | --report] [--transcripts <dir>] [--selftest] [--json]",
    "summary": "is the practice working here: measures against bounds, one proposal; --report writes <health>/<date>.md (.plates/plates.json health, default docs/health)",
    "source": {
      "file": "lib/cli.mjs",
      "line": 489,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--sessions",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--report",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--selftest",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--transcripts",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "sessions exclusive of report/transcripts/selftest; selftest exclusive of report/transcripts.",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "Existing health source observation only; no measure execution/report/session/selftest.",
    "followUp": "Expose source report; require a separately bounded measurement worker for execution."
  },
  {
    "id": "cli.persona-run",
    "command": "persona run",
    "usage": "plates persona run [<name> | --all] [--json]",
    "summary": "measure the goals in .agents/personas/<name>.md: met, missed or broken; writes docs/reviews/<date>-<persona>.md and nothing else (exit 1 missed, 2 broken)",
    "source": {
      "file": "lib/cli.mjs",
      "line": 508,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "name:0..1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--all",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "CLI strips --json; forwarded parseArgs accepts name together with --all; do not infer exclusive syntax from usage.",
        "parserSource": "practices/personas/files/scripts/plates/persona.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Create a bounded registered persona measurement worker before exposing Run."
  },
  {
    "id": "cli.audit-due",
    "command": "audit due",
    "usage": "plates audit due [--quota <file> | --quota-url <url>] [--date YYYY-MM-DD] [--json]",
    "summary": "each audit lens in .agents/audits/<name>.md: due or not, and the first provider whose quota has room, or why it waits (unknown or stale is wait); starts no model",
    "source": {
      "file": "lib/cli.mjs",
      "line": 517,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "none",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--quota",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--quota-url",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--date",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "CLI forwards to the practice parser; --quota and --quota-url name a snapshot file or a loopback URL only; no model is started.",
        "parserSource": "practices/audits/files/scripts/plates/audit.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented; the hosted room read is a later increment of phase 192.",
    "followUp": "Read the same quota snapshot from the hosted store before exposing due on the web."
  },
  {
    "id": "cli.audit-brief",
    "command": "audit brief",
    "usage": "plates audit brief <lens> [--out <file>] [--json]",
    "summary": "print the read-only brief an agent is handed for one audit lens, pinned to HEAD; starts no model",
    "source": {
      "file": "lib/cli.mjs",
      "line": 526,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "lens:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--out",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "CLI forwards to the practice parser; prints a brief and writes nothing.",
        "parserSource": "practices/audits/files/scripts/plates/audit.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Show the brief read-only beside the lens before any hosted audit run exists."
  },
  {
    "id": "cli.audit-record",
    "command": "audit record",
    "usage": "plates audit record <lens> --from <file> [--provider <agent>] [--date YYYY-MM-DD] [--json]",
    "summary": "check an agent's audit findings against the commit it read (each cited file and line must exist), then write docs/audits/<date>-<lens>.md and .json; each finding is triage for the next night",
    "source": {
      "file": "lib/cli.mjs",
      "line": 534,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "lens:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--from",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--provider",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--date",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "CLI forwards to the practice parser; refuses, writing nothing, evidence that does not exist at the audited commit.",
        "parserSource": "practices/audits/files/scripts/plates/audit.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented; recording writes the checkout.",
    "followUp": "Create a bounded registered record worker with the same evidence checks before exposing Record."
  },
  {
    "id": "cli.audit-run",
    "command": "audit run",
    "usage": "plates audit run <lens> [--provider <agent>] [--quota <file> | --quota-url <url>] [--yes] [--json]",
    "summary": "hand one audit lens to the owner's local agent host (local-hosts.json) when a provider has quota room: a detached checkout of HEAD outside the project, the brief on stdin, a receipt; preview without --yes (exit 3), never waits, never records",
    "source": {
      "file": "lib/cli.mjs",
      "line": 542,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "lens:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--provider",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--quota",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--quota-url",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "CLI parses with lib/audit-run.mjs parseRunArgs; without --yes it previews and makes nothing; with it, it runs only the owner's configured local host, once.",
        "parserSource": "lib/audit-run.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented; a run starts a local agent session on the owner's machine.",
    "followUp": "Keep runs local; a hosted run needs its own bounded worker, quota reservation and receipt recovery."
  },
  {
    "id": "cli.time",
    "command": "time",
    "usage": "plates time [--weeks N] [--json]",
    "summary": "gate and test weekly medians, load coverage, failure memory and local worked-around counts",
    "source": {
      "file": "lib/cli.mjs",
      "line": 552,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--weeks",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add dated timing/coverage reader; no fabricated checkout measurements."
  },
  {
    "id": "cli.test",
    "command": "test",
    "usage": "plates test <file>... --stalls [--name <pattern>] [--seed N] [--json]",
    "summary": "run test files paused at seeded random moments (--stalls) and without; name each test that passed without and failed with: it judges the wall clock",
    "source": {
      "file": "lib/cli.mjs",
      "line": 560,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "files:1..n",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--stalls",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--name",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--seed",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "A separate bounded stalls worker is needed; typecheck-v1 does not implement arbitrary test files."
  },
  {
    "id": "cli.drain",
    "command": "drain",
    "usage": "plates drain <prefix> [--gate-passed] [--yes] [--json]",
    "summary": "one open PR per machine queue: merge older data-only PRs, close the rest as superseded; the newest only after a gate",
    "source": {
      "file": "lib/cli.mjs",
      "line": 571,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "prefix:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--gate-passed",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Needs exact queue/PR snapshot, gate proof and explicit merge/close effects; human permission remains distinct."
  },
  {
    "id": "cli.night-plan",
    "command": "night plan",
    "usage": "plates night plan [--date <YYYY-MM-DD>] [--json]",
    "summary": "tonight's default plan, written before the night runs (.plates/night/plan.json): measures, the health proposal, the climb job, the robot's next issue, untriaged Loop findings; no model",
    "source": {
      "file": "lib/cli.mjs",
      "line": 580,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--date",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add canonical plan generation/edit preview; private evening draft is not the shared branch."
  },
  {
    "id": "cli.night-tick",
    "command": "night tick",
    "usage": "plates night tick <id> --status <planned|running|done|failed|skipped|left-alone> [--note \"<text>\"] [--link <url>] [--json]",
    "summary": "tick one item of tonight's plan: its status, with a note and a link; an unknown id or a move back from done is refused (exit 2)",
    "source": {
      "file": "lib/cli.mjs",
      "line": 588,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "id:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--status",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--note",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--link",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add conditional monotonic tick writer with source revision and actor attribution."
  },
  {
    "id": "cli.morning",
    "command": "morning",
    "usage": "plates morning [--date <YYYY-MM-DD>] [--observation | --send | --card [--dry-run | --yes]] [--json]",
    "summary": "the night's brief from its plan as it finished: done, tried, failed and why, left alone or not finished by, your next; --send opens the assigned \"Good morning\" issue once a night; --card publishes the plan as the live canvas card night-plan",
    "source": {
      "file": "lib/cli.mjs",
      "line": 600,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--send",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--card",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--dry-run",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--date",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--observation",
            "arity": 0,
            "repeat": "once",
            "treatment": "limited"
          }
        ],
        "constraints": "send/card conflict; yes/dry-run require card; observation is read-only and conflicts with send/card/yes/dry-run.",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "Bounded source brief only; no --send issue or --card canvas publication.",
    "followUp": "Add exact source-date coverage; retain outbound actions unavailable until their durable adapter exists."
  },
  {
    "id": "cli.goodnight",
    "command": "goodnight",
    "usage": "plates goodnight [add <suggestion-id> | add --title \"<words>\" [--kind <k>] [--measure <m> --bound <n> --better <lower|higher>] [--lane <l>] [--budget <minutes>] [--id <x>] | drop <id> | edit <id> [--title \"<words>\"] [--kind <k>] [--lane <l>] [--measure <m>] [--bound <n>] [--better <b>] [--budget <minutes>] | budget <id> <minutes> | skip <path-or-id> | --yes] [--json]",
    "summary": "the owner shapes tonight's plan: settled today, left open, the default plan, things to try; add|drop|edit|budget|skip change a draft; --yes writes it and pushes it to plates-night-plan",
    "source": {
      "file": "lib/cli.mjs",
      "line": 614,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "--yes only without subcommand; edit requires a valued change; duplicate values last-wins.",
        "parserSource": "lib/goodnight.mjs"
      },
      {
        "subcommand": "add",
        "positionals": "suggestion-id:0..1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--title",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--kind",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--measure",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--bound",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--better",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--lane",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--budget",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--id",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "--yes only without subcommand; edit requires a valued change; duplicate values last-wins.",
        "parserSource": "lib/goodnight.mjs"
      },
      {
        "subcommand": "edit",
        "positionals": "id:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--title",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--kind",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--measure",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--bound",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--better",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--lane",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--budget",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--id",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "--yes only without subcommand; edit requires a valued change; duplicate values last-wins.",
        "parserSource": "lib/goodnight.mjs"
      },
      {
        "subcommand": "drop",
        "positionals": "id:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          }
        ],
        "constraints": "--yes only without subcommand; edit requires a valued change; duplicate values last-wins.",
        "parserSource": "lib/goodnight.mjs"
      },
      {
        "subcommand": "budget",
        "positionals": "id:1 minutes:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          }
        ],
        "constraints": "--yes only without subcommand; edit requires a valued change; duplicate values last-wins.",
        "parserSource": "lib/goodnight.mjs"
      },
      {
        "subcommand": "skip",
        "positionals": "path-or-id:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          }
        ],
        "constraints": "--yes only without subcommand; edit requires a valued change; duplicate values last-wins.",
        "parserSource": "lib/goodnight.mjs"
      }
    ],
    "limitation": "Private evening draft supported; no canonical keel-night-plan publication, CLI budget or arbitrary item parity.",
    "followUp": "Show local/private draft boundary; design reviewed branch publication separately."
  },
  {
    "id": "cli.fleet",
    "command": "fleet",
    "usage": "plates fleet [--json]",
    "summary": "plates only: every project in plates.json — adopted, practice behind, health, CI, unsent lessons, machine PRs; read-only",
    "source": {
      "file": "lib/cli.mjs",
      "line": 622,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "Private manifest fleet lens, not mothership plates.json/local checkout census.",
    "followUp": "Name manifest membership and missing local sources."
  },
  {
    "id": "cli.fleet-update",
    "command": "fleet update",
    "usage": "plates fleet update [--yes | --rehearse | --install <owner/repo#PR> [--yes --digest <digest>] | --recover <operation-id> [--restore-only [--yes --digest <digest>]]] [--json]",
    "summary": "prepare fleet update PRs; --install previews an exact compatible PR, --yes --digest approves installation, and --recover resumes its original receipt; --rehearse pushes nothing",
    "source": {
      "file": "lib/cli.mjs",
      "line": 630,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--rehearse",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--install",
            "arity": 1,
            "repeat": "once",
            "treatment": "limited"
          },
          {
            "token": "--recover",
            "arity": 1,
            "repeat": "once",
            "treatment": "limited"
          },
          {
            "token": "--digest",
            "arity": 1,
            "repeat": "once",
            "treatment": "limited"
          },
          {
            "token": "--restore-only",
            "arity": 0,
            "repeat": "once",
            "treatment": "limited"
          }
        ],
        "constraints": "yes/rehearse conflict; install/recover exclusive; install apply requires yes and digest together; recover normally rejects yes/digest/rehearse; restore-only requires recover and supports exact yes/digest apply; digest otherwise requires install.",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "Reviewed serial canary rollout of supported update preparation/publication; not blind all-fleet --yes. Source installation/recovery remains CLI-only; no hosted merge or workflow barrier authority.",
    "followUp": "Expose remaining unsupported repositories and rehearsal mode differences."
  },
  {
    "id": "cli.loose-ends",
    "command": "loose-ends",
    "usage": "plates loose-ends [--all] [--phase N] [--root <dir>] [--fresh] [--json] | mark <id> resume|park|drop --reason \"<why>\" [--until YYYY-MM-DD]",
    "summary": "what you started and did not finish, in plates and each fleet checkout: chats, files, branches, PRs, owner steps; read-only but mark",
    "source": {
      "file": "lib/cli.mjs",
      "line": 655,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--all",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--fresh",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--phase",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--root",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      },
      {
        "subcommand": "mark",
        "positionals": "id:1 move:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--reason",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--until",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--root",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add bounded source-owned loose-end list/mark adapter; local chats/checkouts need enrolled local bridge."
  },
  {
    "id": "cli.sessions",
    "command": "sessions",
    "usage": "plates sessions [--json] | waiting [--json] | push [--site <url>] [--json]",
    "summary": "home sessions and runme scripts waiting on you on this machine; push sends them to your Plates workspace with this device's key",
    "source": {
      "file": "lib/cli.mjs",
      "line": 675,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "none",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      },
      {
        "subcommand": "waiting",
        "positionals": "none",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      },
      {
        "subcommand": "push",
        "positionals": "none",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--site",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "push reads the device key from PLATES_DEVICE_KEY or the macOS keychain at run time and sends only the waiting-sessions snapshot to the named https workspace.",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "Local only: the hosted workspace receives the snapshot through its device-key route; nothing in the web runs this command.",
    "followUp": "None."
  },
  {
    "id": "cli.feedback",
    "command": "feedback",
    "usage": "plates feedback capture <file> [--yes --digest <sha256>] | list | propose <id> --record <file> | resolve <id> --record <file> [--yes --digest <sha256>] [--json]",
    "summary": "capture private feedback on an exact result; preview follow-up or resolution without starting work",
    "source": {
      "file": "lib/cli.mjs",
      "line": 685,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": "capture",
        "positionals": "file:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--digest",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "yes and digest supplied together; lowercase64hex; duplicate options rejected.",
        "parserSource": "lib/cli.mjs"
      },
      {
        "subcommand": "list",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      },
      {
        "subcommand": "propose",
        "positionals": "id:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--record",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      },
      {
        "subcommand": "resolve",
        "positionals": "id:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--record",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--digest",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "yes/digest pair; record required.",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "Guided-walk feedback/repair subset does not expose general private CLI feedback store.",
    "followUp": "Add authenticated exact-result capture/list/propose/resolve handoff; preserve original observations."
  },
  {
    "id": "cli.issue",
    "command": "issue",
    "usage": "plates issue new --agent --title <title> --rubric <file> [--yes] [--json]",
    "summary": "preview or create a rubric-shaped agent issue; OFF stays unlabelled, --yes approves creation",
    "source": {
      "file": "lib/cli.mjs",
      "line": 707,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": "new",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--agent",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--title",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--rubric",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "agent/title/rubric required; unique.",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "Walk repair preview is not unrestricted issue new --agent dispatch.",
    "followUp": "Implement explicit reviewed robot issue adapter with preserved durable intent."
  },
  {
    "id": "cli.review",
    "command": "review",
    "usage": "plates review <owner/repo>#<n> [--wait] [--gate] [--reviewer <login>]... [--json] | <owner/repo>@<sha> [--json] | --close <id>[,<id>…] --fixed <commit>|--tracked <issue|version>|--not-valid \"<why>\" [--class <kind>] | --class security|overwrite|approval|other <id>[,<id>…] | --close <id> --tracked --file-agent-issue --title <title> --rubric <file> [--yes]",
    "summary": "a PR's review comments, or a push's review after it landed (<repo>@<sha>), which are answered; --wait for its reviewers; --close answers one it read (never in bulk): fixed, tracked or not valid; --class sorts one by the merge rule without answering it. Not a gate; at its round limit (exit 3) the owner chooses",
    "source": {
      "file": "lib/cli.mjs",
      "line": 726,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": "read",
        "positionals": "repository#PR-or-repository@SHA:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--wait",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--gate",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--reviewer",
            "arity": 1,
            "repeat": "explicitly repeatable",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      },
      {
        "subcommand": "answer",
        "positionals": "target:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--close",
            "arity": 1,
            "repeat": "explicitly repeatable",
            "treatment": "limited"
          },
          {
            "token": "--fixed",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--tracked",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--not-valid",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--class",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "--close selects this mode, not literal answer; one response kind; no wait/gate/reviewer.",
        "parserSource": "lib/cli.mjs"
      },
      {
        "subcommand": "classify",
        "positionals": "target:1 findingIds:1..n",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--class",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "--class without --close selects mode, not literal classify.",
        "parserSource": "lib/cli.mjs"
      },
      {
        "subcommand": "file-agent-issue",
        "positionals": "repository#PR:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--tracked",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--file-agent-issue",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--close",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--title",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--rubric",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--class",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "--file-agent-issue selects mode; --tracked BOOLEAN here; exactly one close/title/rubric; no fixed/not-valid.",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add exact comment/commit review reader and immutable answer/classification adapter; no blind bulk response."
  },
  {
    "id": "cli.home",
    "command": "home",
    "usage": "plates home [--project <id>] [--fresh] [--names-evidence] [--json] | --answer <item-key> <answer-id> [--why \"<line>\"] [--until YYYY-MM-DD] [--yes] [--json] | --review [--quick] [--project <id>] [--json]",
    "summary": "the hosted home, in a terminal: what needs you (decisions, walks to try, reviews waiting on you), what changed, your plates and what is waiting, from the same read model as /api/home, read from this checkout and gh; local work and the other sections the web cannot read are rows in both",
    "source": {
      "file": "lib/cli.mjs",
      "line": 759,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--project",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "native"
          },
          {
            "token": "--fresh",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "--project names one plate by its home id; JSON is /api/home's content without its transport fields.",
        "parserSource": "lib/cli.mjs"
      },
      {
        "subcommand": null,
        "positionals": "--answer <item-key> <answer-id>",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--answer",
            "arity": 2,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--why",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--until",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "Phase 173: one answer to one item in Needs you, through the writer its answer names; a preview (exit 3) until --yes. The web's POST /api/home/answer writes Not now and previews a health decision; it lists the writers it cannot run with this command.",
        "parserSource": "lib/cli.mjs"
      },
      {
        "subcommand": null,
        "positionals": "--review",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--review",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--quick",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "native"
          },
          {
            "token": "--project",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "native"
          }
        ],
        "constraints": "Phase 174: the docket one card at a time from stdin, in the order the web's /review session walks it; each answer is previewed through --answer's writer and written only after a yes. The web session holds an answer for five seconds with Undo instead. Phase 175: --quick walks only the quick ones (2 minutes or less each), as the web's /review?quick=1 does.",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "The hosted Home is the web form of this read model; sections the App cannot read are rows there, named with this command.",
    "followUp": "Keep plates home --json and /api/home equal for the same sources (tests/home-isomorphism.test.mjs)."
  },
  {
    "id": "cli.board",
    "command": "board",
    "usage": "plates board (retired: run plates home)",
    "summary": "retired (phase 156): plates home shows the same work, the same way the hosted home does; plates board prints that and exits 2, for one release",
    "source": {
      "file": "lib/cli.mjs",
      "line": 858,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          }
        ],
        "constraints": "Any arguments: prints the replacement and exits 2; starts no server and reads nothing.",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "Retired; plates home and the hosted home are its two forms.",
    "followUp": "Remove the verb after one release, once no caller runs plates board."
  },
  {
    "id": "cli.channel",
    "command": "channel",
    "usage": "plates channel [<project>] [--since <time>] [--fresh] [--json]",
    "summary": "each plate's channel, read only: who joined (claims), what was opened, pushed, checked and deployed, and who waits on you, newest last, with Here now; the same lines as /channel on your Plates site",
    "source": {
      "file": "lib/cli.mjs",
      "line": 867,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "project:0..1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--since",
            "arity": 1,
            "repeat": "once",
            "treatment": "presentation-only"
          },
          {
            "token": "--fresh",
            "arity": 0,
            "repeat": "once",
            "treatment": "presentation-only"
          }
        ],
        "constraints": "Read only: reads claims, open pull requests, changes in flight, deploy records and this machine's waiting sessions through the readers plates home uses; stores, posts and writes nothing. --since narrows the seven-day window, never widens it.",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "Read only (phase 194, increment 1): agents' own lines (plates say) and the owner's checkpoints are later increments; unread counts the last 24 hours, with no read position kept.",
    "followUp": "Increment 2 adds plates say behind migration 024."
  },
  {
    "id": "cli.promote",
    "command": "promote",
    "usage": "plates promote [<commit>] [--yes] [--within <s>] [--every <s>] [--watch <s>] [--migrated <file>]... [--migrations-from <commit>] [--json] | --back [<commit>] [--yes] [--within <s>] [--every <s>] [--json]",
    "summary": "move production (\"delivery\".promote) to a commit on the tested ref whose gate passed: a preview (exit 3), then --yes moves it and verifies production serves it; --back <commit> rolls back and needs exactly that commit served; a Vercel target deploys, checks itself and rolls itself back, and --back alone returns to the last deployment that passed; a person's command, never a workflow's",
    "source": {
      "file": "lib/cli.mjs",
      "line": 884,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "commit:0..1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--back",
            "arity": "0..1",
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--within",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--every",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--watch",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--migrated",
            "arity": 1,
            "repeat": "repeatable",
            "treatment": "limited"
          },
          {
            "token": "--migrations-from",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "CLI delegates unvalidated argv to installed scripts/plates/promote.mjs. This canonical grammar is only applicable after installed source identity/drift validation. --back supplies an optional commit (a Vercel target: none means the last deployment that passed); at most one commit. --watch, --migrated and --migrations-from are a Vercel target's only.",
        "parserSource": "practices/delivery/files/scripts/plates/promote.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Design reviewed deployment/rollback adapter with gate and serving-revision proofs, separate from update PR."
  },
  {
    "id": "cli.walk",
    "command": "walk",
    "usage": "plates walk done <phase> (--note \"<what you saw>\" | --choice \"<one of its Your part's Choices>\" [--note \"…\"]) [--box <n>] [--json] | decide --proposal <health page> [--instance <id>] (--accept [\"<why>\"] | --decline \"<why>\" | --map <file>) [--json]",
    "summary": "settle the owner's turn: done checks a phase's ⚑ walk box and writes the read (or the choice from its Your part) into its evidence (built when nothing is left); decide accepts or declines a health proposal; leaves a diff",
    "source": {
      "file": "lib/cli.mjs",
      "line": 900,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": "done",
        "positionals": "phase:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--note",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--box",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--choice",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      },
      {
        "subcommand": "decide",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--proposal",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--instance",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--map",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--accept",
            "arity": "0..1",
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--decline",
            "arity": "1",
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "accept optional explanation; decline requires explanation; map alternative. No --yes.",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "Authored guided walks; exact all-pass acceptance preview. Legacy health proposal decision separately supported; arbitrary CLI box/choice/map forms not universal.",
    "followUp": "Declare each supported authored target and mark unsupported legacy forms."
  },
  {
    "id": "cli.canvas",
    "command": "canvas",
    "usage": "plates canvas snapshot [--output <file>] [--github] [--artifact <repo-relative-json>]... [--history <repo-relative-json>]... [--window-days <N>] [--json]\nplates canvas render --snapshot <file> --output <dir> [--json]\nplates canvas connect --create --title <title> --space <id> --home <origin> --audience owner-only [--yes] [--json]\nplates canvas connect --canvas <address> --audience owner-only [--home <origin>] [--yes] [--json]\nplates canvas sync [--snapshot <file> | --github] [--dry-run | --yes] [--json]\nplates canvas status [--json]\nplates canvas live [--card <key>]... [--keep <N> | --no-keep] [--off] [--yes] [--json]\nplates canvas rebase [--card <key>] [--onto <version-id>] [--yes] [--json]\nplates canvas disconnect [--yes] [--json]\nplates canvas night --report <file> [--yes] [--json]",
    "summary": "project canvas: local snapshot/render; connect, sync, status, live, rebase, disconnect, night",
    "source": {
      "file": "lib/cli.mjs",
      "line": 926,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": "snapshot",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--github",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--output",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--artifact",
            "arity": 1,
            "repeat": "explicitly repeatable",
            "treatment": "limited"
          },
          {
            "token": "--history",
            "arity": 1,
            "repeat": "explicitly repeatable",
            "treatment": "limited"
          },
          {
            "token": "--window-days",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "Strict form parser; canvas capture explicitly refused. Connect create XOR canvas + owner-only audience; render snapshot/output; sync snapshot/github and yes/dry-run exclusive; live keep/no-keep conflict; rebase yes requires onto.",
        "parserSource": "lib/canvas.mjs"
      },
      {
        "subcommand": "render",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--snapshot",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--output",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "Strict form parser; canvas capture explicitly refused. Connect create XOR canvas + owner-only audience; render snapshot/output; sync snapshot/github and yes/dry-run exclusive; live keep/no-keep conflict; rebase yes requires onto.",
        "parserSource": "lib/canvas.mjs"
      },
      {
        "subcommand": "connect",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--create",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--canvas",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--title",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--space",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--home",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--audience",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "Strict form parser; canvas capture explicitly refused. Connect create XOR canvas + owner-only audience; render snapshot/output; sync snapshot/github and yes/dry-run exclusive; live keep/no-keep conflict; rebase yes requires onto.",
        "parserSource": "lib/canvas.mjs"
      },
      {
        "subcommand": "sync",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--github",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--dry-run",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--snapshot",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "Strict form parser; canvas capture explicitly refused. Connect create XOR canvas + owner-only audience; render snapshot/output; sync snapshot/github and yes/dry-run exclusive; live keep/no-keep conflict; rebase yes requires onto.",
        "parserSource": "lib/canvas.mjs"
      },
      {
        "subcommand": "status",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          }
        ],
        "constraints": "Strict form parser; canvas capture explicitly refused. Connect create XOR canvas + owner-only audience; render snapshot/output; sync snapshot/github and yes/dry-run exclusive; live keep/no-keep conflict; rebase yes requires onto.",
        "parserSource": "lib/canvas.mjs"
      },
      {
        "subcommand": "live",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--off",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--no-keep",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--keep",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--card",
            "arity": 1,
            "repeat": "explicitly repeatable",
            "treatment": "limited"
          }
        ],
        "constraints": "Strict form parser; canvas capture explicitly refused. Connect create XOR canvas + owner-only audience; render snapshot/output; sync snapshot/github and yes/dry-run exclusive; live keep/no-keep conflict; rebase yes requires onto.",
        "parserSource": "lib/canvas.mjs"
      },
      {
        "subcommand": "rebase",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--onto",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--card",
            "arity": 1,
            "repeat": "explicitly repeatable",
            "treatment": "limited"
          }
        ],
        "constraints": "Strict form parser; canvas capture explicitly refused. Connect create XOR canvas + owner-only audience; render snapshot/output; sync snapshot/github and yes/dry-run exclusive; live keep/no-keep conflict; rebase yes requires onto.",
        "parserSource": "lib/canvas.mjs"
      },
      {
        "subcommand": "disconnect",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "Strict form parser; canvas capture explicitly refused. Connect create XOR canvas + owner-only audience; render snapshot/output; sync snapshot/github and yes/dry-run exclusive; live keep/no-keep conflict; rebase yes requires onto.",
        "parserSource": "lib/canvas.mjs"
      },
      {
        "subcommand": "night",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--report",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "Strict form parser; canvas capture explicitly refused. Connect create XOR canvas + owner-only audience; render snapshot/output; sync snapshot/github and yes/dry-run exclusive; live keep/no-keep conflict; rebase yes requires onto.",
        "parserSource": "lib/canvas.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add authenticated canvas source/destination adapter with conditional remote version writes and recovery."
  },
  {
    "id": "cli.retro",
    "command": "retro",
    "usage": "plates retro [--worksheet] [--since <commit>] [--session <id>] [--json] | capture --record <file> [--since <commit>] [--session <id>] [--yes] [--json] | evaluations corpus <inspect|export> [--case <id> --repository <dir> --destination <dir> --yes --digest <sha>] [--json] | evaluations <plan|freeze|inspect|run|resume|reconcile|cancel|compare> --manifest <file> --state <dir> [--bundle <file>] [--experiment <id>] [--execution <file>] [--credential-fd <N>] [--yes --digest <sha>] [--json] | quality <baseline|collect|inspect|report|weekly|replay-plan|lifecycle|pending> [--repository <dir>]... [--pr-metadata <file>]... [--limit <n>] [--manifest <file> --state <dir>] [--bundle <file>] [--record <file>] [--reference-mix <file>] [--previous <file>] [--yes --digest <sha>] [--json] | sessions <status|start|begin|finish|handoff|audit|apply|rollback> [--experiment <id>] [--record <file>] [--yes] [--json]",
    "summary": "retro worksheet, reviewed capture, agent quality and bounded session trials; mutations require --yes",
    "source": {
      "file": "lib/cli.mjs",
      "line": 944,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--worksheet",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--since",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--session",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      },
      {
        "subcommand": "capture",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--record",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--since",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--session",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/canvas.mjs"
      },
      {
        "subcommand": "sessions status",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--experiment",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--record",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "All options parse on each form; start/begin/finish/handoff require authored record. Status may configure from record; audit/apply/rollback refuse record. Domain controls --yes requirements.",
        "parserSource": "lib/session-trials.mjs"
      },
      {
        "subcommand": "sessions start",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--experiment",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--record",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "All options parse on each form; start/begin/finish/handoff require authored record. Status may configure from record; audit/apply/rollback refuse record. Domain controls --yes requirements.",
        "parserSource": "lib/session-trials.mjs"
      },
      {
        "subcommand": "sessions begin",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--experiment",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--record",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "All options parse on each form; start/begin/finish/handoff require authored record. Status may configure from record; audit/apply/rollback refuse record. Domain controls --yes requirements.",
        "parserSource": "lib/session-trials.mjs"
      },
      {
        "subcommand": "sessions finish",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--experiment",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--record",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "All options parse on each form; start/begin/finish/handoff require authored record. Status may configure from record; audit/apply/rollback refuse record. Domain controls --yes requirements.",
        "parserSource": "lib/session-trials.mjs"
      },
      {
        "subcommand": "sessions handoff",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--experiment",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--record",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "All options parse on each form; start/begin/finish/handoff require authored record. Status may configure from record; audit/apply/rollback refuse record. Domain controls --yes requirements.",
        "parserSource": "lib/session-trials.mjs"
      },
      {
        "subcommand": "sessions audit",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--experiment",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--record",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "All options parse on each form; start/begin/finish/handoff require authored record. Status may configure from record; audit/apply/rollback refuse record. Domain controls --yes requirements.",
        "parserSource": "lib/session-trials.mjs"
      },
      {
        "subcommand": "sessions apply",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--experiment",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--record",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "All options parse on each form; start/begin/finish/handoff require authored record. Status may configure from record; audit/apply/rollback refuse record. Domain controls --yes requirements.",
        "parserSource": "lib/session-trials.mjs"
      },
      {
        "subcommand": "sessions rollback",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--experiment",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--record",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "All options parse on each form; start/begin/finish/handoff require authored record. Status may configure from record; audit/apply/rollback refuse record. Domain controls --yes requirements.",
        "parserSource": "lib/session-trials.mjs"
      },
      {
        "subcommand": "evaluations plan",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "forbidden",
            "treatment": "presentation-only"
          },
          {
            "token": "--manifest",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--state",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--bundle",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          }
        ],
        "constraints": "Explicit initialized external workspace and authorized comparison repository required. Plan and inspect read only. Freeze previews; --yes requires exact --digest. No execution, reservation or acceptance. Other operations refuse.",
        "parserSource": "lib/evaluation-ledger.mjs"
      },
      {
        "subcommand": "evaluations freeze",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "forbidden",
            "treatment": "presentation-only"
          },
          {
            "token": "--manifest",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--state",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--bundle",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--digest",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          }
        ],
        "constraints": "Explicit initialized external workspace and authorized comparison repository required. Plan and inspect read only. Freeze previews; --yes requires exact --digest. No execution, reservation or acceptance. Other operations refuse.",
        "parserSource": "lib/evaluation-ledger.mjs"
      },
      {
        "subcommand": "evaluations inspect",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "forbidden",
            "treatment": "presentation-only"
          },
          {
            "token": "--manifest",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--state",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--experiment",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          }
        ],
        "constraints": "Explicit initialized external workspace and authorized comparison repository required. Plan and inspect read only. Freeze previews; --yes requires exact --digest. No execution, reservation or acceptance. Other operations refuse.",
        "parserSource": "lib/evaluation-ledger.mjs"
      },
      {
        "subcommand": "evaluations run",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "forbidden",
            "treatment": "presentation-only"
          },
          {
            "token": "--manifest",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--state",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--experiment",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--execution",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--credential-fd",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--digest",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          }
        ],
        "constraints": "Initialized private workspace and exact frozen plan. Schema1 offline descriptor preserves existing behavior and refuses --credential-fd. Schema2 live descriptor selects count or generation for one slot under host-gateway-v1; generation binds the original successful count and identical packet/model. Preview exits 3, writes nothing and reads no FD. Each stage requires separate exact --yes --digest approval, explicit price evidence and bounded spend/host admission. Live dispatch reads only an inherited pipe-json-v1 credential FD N>=3 on a supported host; metadata is not entitlement. Original operations never redispatch; uncertain usage stays held. No hosted activation or permission inference.",
        "parserSource": "lib/evaluation-ledger.mjs"
      },
      {
        "subcommand": "evaluations resume",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "forbidden",
            "treatment": "presentation-only"
          },
          {
            "token": "--manifest",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--state",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--experiment",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--execution",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--digest",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          }
        ],
        "constraints": "Schema1 offline executions follow frozen pair order and run missing slots only after exact --yes --digest approval. Live aggregate resume refuses; no --credential-fd. Preserve original attempts, allowance and unknown costs. No hosted activation or permission inference.",
        "parserSource": "lib/evaluation-comparison.mjs"
      },
      {
        "subcommand": "evaluations reconcile",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "forbidden",
            "treatment": "presentation-only"
          },
          {
            "token": "--manifest",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--state",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--experiment",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--execution",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--credential-fd",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--digest",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          }
        ],
        "constraints": "Legacy offline recovery preserves existing behavior and refuses --execution and --credential-fd. Live recovery requires --execution with a closed schema2 stage recovery descriptor, exactly one target, and mode provider-get or local-only. Preview exits 3, writes nothing and reads no FD; exact --yes --digest approves only the selected mode. Provider-get performs one separately quoted, bounded GET of the retained original response ID with an inherited pipe-json-v1 credential FD N>=3 on a supported host; no repeated POST or polling. Local-only rejects --credential-fd even on preview and performs no provider or spend operation. Host release does not release unknown money; preserve original acceptance and receipts. No hosted activation or permission inference.",
        "parserSource": "lib/evaluation-ledger.mjs"
      },
      {
        "subcommand": "evaluations cancel",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "forbidden",
            "treatment": "presentation-only"
          },
          {
            "token": "--manifest",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--state",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--experiment",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--digest",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          }
        ],
        "constraints": "Preview and exact --yes --digest approve bounded local cancellation of original operations. No --execution or --credential-fd; no provider cancellation request or confirmation. Preserve uncertain reservations, original identities and verdicts. No hosted activation or permission inference.",
        "parserSource": "lib/evaluation-comparison.mjs"
      },
      {
        "subcommand": "evaluations compare",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "forbidden",
            "treatment": "presentation-only"
          },
          {
            "token": "--manifest",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--state",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--experiment",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          }
        ],
        "constraints": "Read-only comparison of original attempts, failures, costs and coverage gaps. Unknown usage is not zero; retained results do not establish acceptance or live efficacy. No --yes, --digest, --execution or --credential-fd. No hosted activation or permission inference.",
        "parserSource": "lib/evaluation-comparison.mjs"
      },
      {
        "subcommand": "evaluations corpus inspect",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "forbidden",
            "treatment": "presentation-only"
          }
        ],
        "constraints": "Six exposed development cases; held-out zero. Read-only inspection; export previews exact bytes and writes a new private destination outside Git only with exact approval. No execution, no hosted or live-provider activation.",
        "parserSource": "lib/evaluation-corpus.mjs"
      },
      {
        "subcommand": "evaluations corpus export",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "forbidden",
            "treatment": "presentation-only"
          },
          {
            "token": "--case",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--repository",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--destination",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--digest",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          }
        ],
        "constraints": "Six exposed development cases; held-out zero. Read-only inspection; export previews exact bytes and writes a new private destination outside Git only with exact approval. No execution, no hosted or live-provider activation.",
        "parserSource": "lib/evaluation-corpus.mjs"
      },
      {
        "subcommand": "quality baseline",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "forbidden",
            "treatment": "presentation-only"
          },
          {
            "token": "--repository",
            "arity": 1,
            "repeat": "allowed",
            "treatment": "limited"
          },
          {
            "token": "--pr-metadata",
            "arity": 1,
            "repeat": "allowed",
            "treatment": "limited"
          },
          {
            "token": "--limit",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          }
        ],
        "constraints": "CLI-only bounded metadata read. Repeated --repository and --pr-metadata pair by order; total limit 1..200, maximum ten repositories. No model identity, acceptance or task mapping inferred; no state writes or network calls. Other options refuse.",
        "parserSource": "lib/agent-quality.mjs"
      },
      {
        "subcommand": "quality collect",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "forbidden",
            "treatment": "presentation-only"
          },
          {
            "token": "--manifest",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--state",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--bundle",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--digest",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          }
        ],
        "constraints": "CLI-only immutable metadata collection into an initialized private external workspace. Preview exits 3. --yes requires exact --digest; repeated input retains original receipt. Manifest authorizes projects; frozen references resolve to existing slots. No execution, routing or provider grant.",
        "parserSource": "lib/agent-quality.mjs"
      },
      {
        "subcommand": "quality inspect",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "forbidden",
            "treatment": "presentation-only"
          },
          {
            "token": "--manifest",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--state",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          }
        ],
        "constraints": "CLI-only read of private observations, retained receipts and frozen reference coverage. Explicit initialized external workspace required. No writes, cleanup or provider calls; collection and report options refuse.",
        "parserSource": "lib/agent-quality.mjs"
      },
      {
        "subcommand": "quality report",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "forbidden",
            "treatment": "presentation-only"
          },
          {
            "token": "--manifest",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--state",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--previous",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--reference-mix",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          }
        ],
        "constraints": "CLI-only read-only scorecards. Optional prior report and fixed reference mix are bounded explicit JSON inputs. Unknown evidence and incomplete costs remain unknown. No routing changes, paid execution or hosted adapter.",
        "parserSource": "lib/agent-quality.mjs"
      },
      {
        "subcommand": "quality weekly",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "forbidden",
            "treatment": "presentation-only"
          },
          {
            "token": "--manifest",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--state",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--previous",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--reference-mix",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--repository",
            "arity": 1,
            "repeat": "allowed",
            "treatment": "limited"
          },
          {
            "token": "--pr-metadata",
            "arity": 1,
            "repeat": "allowed",
            "treatment": "limited"
          },
          {
            "token": "--limit",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--bundle",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--digest",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          }
        ],
        "constraints": "CLI-only local collection and immutable weekly report. Preview exits 3; exact --yes --digest binds local bundle, selected metadata and report inputs. Retains original report on recovery. No scheduler, automatic model calls or hosted adapter.",
        "parserSource": "lib/agent-quality.mjs"
      },
      {
        "subcommand": "quality replay-plan",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "forbidden",
            "treatment": "presentation-only"
          },
          {
            "token": "--manifest",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--state",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--previous",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--reference-mix",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          }
        ],
        "constraints": "CLI-only read-only disabled replay/crossover proposal. Evidence-bound workflows and required frozen inputs are described; currency budgets stay null and no provider dispatch is available. No hosted execution or routing changes.",
        "parserSource": "lib/agent-quality.mjs"
      },
      {
        "subcommand": "quality lifecycle",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "forbidden",
            "treatment": "presentation-only"
          },
          {
            "token": "--manifest",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--state",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--record",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--digest",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          }
        ],
        "constraints": "CLI-only explicit local stage events from a strict --record. Exact preview approval retains begin, start, finish, annotations, human/model adjudication and followup through the existing private ledger. No execution or hosted adapter.",
        "parserSource": "lib/agent-quality.mjs"
      },
      {
        "subcommand": "quality pending",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "forbidden",
            "treatment": "presentation-only"
          },
          {
            "token": "--manifest",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          },
          {
            "token": "--state",
            "arity": 1,
            "repeat": "forbidden",
            "treatment": "limited"
          }
        ],
        "constraints": "CLI-only read-only pending annotation queue. Frozen gaps, human judgments and delayed outcomes remain distinct. No mutation or model calls.",
        "parserSource": "lib/agent-quality.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Use local retro evaluations for frozen offline trials or separately approved one-slot live count/generation and original-operation recovery. Capability coverage grants no provider transfer, spend or permission; no hosted activation."
  },
  {
    "id": "cli.workspace",
    "command": "workspace",
    "usage": "plates workspace inspect|init --manifest <absolute-file> --state <absolute-dir> [--yes] [--json]",
    "summary": "inspect or initialize explicitly external private workspace state",
    "source": {
      "file": "lib/cli.mjs",
      "line": 957,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": "inspect",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--manifest",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--state",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/web/workspace.mjs"
      },
      {
        "subcommand": "init",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--manifest",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--state",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "Explicit absolute external paths; duplicate flags refused.",
        "parserSource": "lib/web/workspace.mjs"
      }
    ],
    "limitation": "Hosted setup diagnostics do not create local external state or remote accounts.",
    "followUp": "Provide exact bootstrap instructions or enrolled local agent; retain terminal boundary."
  },
  {
    "id": "cli.shape",
    "command": "shape",
    "usage": "plates shape check|render|plan <file> [--output <new-directory>] [--yes --digest <reviewed-digest>] [--json]",
    "summary": "validate and review local shaping records; digest-approved draft writes",
    "source": {
      "file": "lib/cli.mjs",
      "line": 962,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": "check",
        "positionals": "file:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          }
        ],
        "constraints": "",
        "parserSource": "lib/shaping.mjs"
      },
      {
        "subcommand": "render",
        "positionals": "file:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--output",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "",
        "parserSource": "lib/shaping.mjs"
      },
      {
        "subcommand": "plan",
        "positionals": "file:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--digest",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "yes requires reviewed digest in writeShape; digest without yes refused.",
        "parserSource": "lib/shaping.mjs"
      }
    ],
    "limitation": "Answering supported shaping question is not check/render/plan of arbitrary draft.",
    "followUp": "Add bounded source-record validation/preview; separate plan commit approval."
  },
  {
    "id": "cli.decision",
    "command": "decision",
    "usage": "plates decision context --phase <id> | --issue <owner/repo#n> [--json]",
    "summary": "read-only scoped decision context for a builder",
    "source": {
      "file": "lib/cli.mjs",
      "line": 967,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": "context",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--phase",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--issue",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "Exactly one phase or issue required by resolver.",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "Canonical context consumed inside decisions/walks/model tasks; no general issue/phase context explorer route.",
    "followUp": "Add read-only context explorer with complete/not-configured/gaps distinction."
  },
  {
    "id": "cli.production",
    "command": "production",
    "usage": "plates production status|collect|spec|verify [--source <id>] [--start <UTC>] [--end <UTC>] [--incident <id>] [--revision <sha>] [--probe <path>] [--rubric <file>] [--recover] [--yes] [--json]",
    "summary": "bounded production errors, recurring repair specs and evidence-conscious verification",
    "source": {
      "file": "lib/cli.mjs",
      "line": 980,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": "status",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--recover",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--source",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--start",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--end",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--incident",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--revision",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--probe",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "Shared parser accepts listed options across forms; domain chooses meaningful options. Default status; recover only affects status.",
        "parserSource": "practices/night/files/scripts/plates/production.mjs"
      },
      {
        "subcommand": "collect",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--recover",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--source",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--start",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--end",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--incident",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--revision",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--probe",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "Shared parser accepts listed options across forms; domain chooses meaningful options. Default status; recover only affects status.",
        "parserSource": "practices/night/files/scripts/plates/production.mjs"
      },
      {
        "subcommand": "spec",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--recover",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--source",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--start",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--end",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--incident",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--revision",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--probe",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "Shared parser accepts listed options across forms; domain chooses meaningful options. Default status; recover only affects status.",
        "parserSource": "practices/night/files/scripts/plates/production.mjs"
      },
      {
        "subcommand": "verify",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--recover",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--source",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--start",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--end",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--incident",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--revision",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--probe",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "Shared parser accepts listed options across forms; domain chooses meaningful options. Default status; recover only affects status.",
        "parserSource": "practices/night/files/scripts/plates/production.mjs"
      },
      {
        "subcommand": "spec-rubric",
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--incident",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--rubric",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "spec --rubric selects this special mode; only incident/rubric/yes/json allowed, not generic source/time flags.",
        "parserSource": "lib/production.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add bounded collector and exact incident repair/verification adapters; absence is not healthy."
  },
  {
    "id": "cli.prove",
    "command": "prove",
    "usage": "plates prove <test file> [--name <pattern>] --fix <path>... [--base <ref>] [--mutate] [--trailer] [--evidence <phase>] [--json]",
    "summary": "a fix is proven by its test failing without it: VERIFIED, NOT WORKING or INCONCLUSIVE; never touches the working tree",
    "source": {
      "file": "lib/cli.mjs",
      "line": 985,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "test-file:1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--mutate",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--trailer",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--name",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--fix",
            "arity": "1..n",
            "repeat": "explicitly repeatable",
            "treatment": "limited"
          },
          {
            "token": "--base",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--evidence",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "--fix consumes paths until next flag, repeatable; local isolated runner.",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Create separately approved isolated red/green runner and evidence preview; typecheck worker is insufficient."
  },
  {
    "id": "cli.release",
    "command": "release",
    "usage": "plates release [<x.y.z> --notes <file|-> [--practice <x.y.z>] [--unreviewed \"<why>\"] [--despite <repo> \"<why>\"]…] [--dry-run] [--json]",
    "summary": "plates only: cut a CLI version, and the practice version only if practices/, migrations/ or docs/lessons.md changed — review gate, WHATSNEW entry, gate, fleet rehearsal, commit, local tag",
    "source": {
      "file": "lib/cli.mjs",
      "line": 1007,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "version:0..1",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--dry-run",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--notes",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--practice",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--unreviewed",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--despite",
            "arity": "2",
            "repeat": "explicitly repeatable",
            "treatment": "limited"
          }
        ],
        "constraints": "--despite repeated repository + reason pair; --yes explicitly rejected. --notes - reads stdin. No version is release inspection.",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Create separately approved mothership release workflow with exact notes, rehearsal, gate, tag effects."
  },
  {
    "id": "cli.help",
    "command": "help",
    "usage": "plates help [--json]",
    "summary": "the verbs, one line each",
    "source": {
      "file": "lib/cli.mjs",
      "line": 1041,
      "sha256": "5bf187de64f179f74deb71aea03d79c27ee078eb719630a12703901b7bf08334"
    },
    "forms": [
      {
        "subcommand": null,
        "positionals": "",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          }
        ],
        "constraints": "",
        "parserSource": "lib/cli.mjs"
      }
    ],
    "limitation": "CLI text help is presentation, but web capability help is not yet complete.",
    "followUp": "Generate searchable capability help from shared registry."
  }
];
