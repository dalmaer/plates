// Reviewed CLI forms; scoped autonomy and offline evaluations retain their separate authority boundaries.
// Usage and summary belong to the dispatcher; importing it does not run a command.
import { verbs } from '../cli.mjs';

export default [
  {
    "id": "cli.autonomy",
    "command": "autonomy",
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
        "constraints": "Read-only without --level or its legacy --mode alias; the flags cannot be combined. Low=default, Medium=local, High=delivery. Selection requires explicit level plus reviewed --yes --digest; lists replace prior scope. Push namespaces require current target-bound protection evidence and exclude protected/default branches. No wildcard/refspec, host consent or merge-gate bypass."
      }
    ],
    "limitation": "Local project selection and supported agent context only. Project Home displays source declarations; host approval controls have no authenticated adapter and remain unavailable.",
    "followUp": "In the intended checkout, run plates autonomy --json, preview the desired Low, Medium or High scope, then explicitly confirm the returned digest. Existing host, merge, deployment and security gates remain in force."
  },
  {
    "id": "cli.migrate",
    "command": "migrate",
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
        "constraints": "Default root is the current directory. --yes and --digest must be supplied together; digest is the exact lowercase 64-character SHA-256 preview digest. Duplicate approval flags, unknown flags and extra roots are refused before reading the root. Preview does not apply the migration."
      }
    ],
    "limitation": "Local checkout migration only; the web service cannot rename files, remotes or repositories through this catalogue.",
    "followUp": "Run plates migrate in the intended checkout, review its exact file plan, then approve that plan with paired --yes and --digest; retain the recovery journal after uncertainty."
  },
  {
    "id": "cli.names",
    "command": "names",
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
        "constraints": "Preview is read-only. Apply requires paired --yes and exact --digest with one --repo or separate --machine scope. Recovery cannot combine with approval or repository selection. Verification is separate and accepts optional positive --run. Unknown or duplicate nonrepeatable arguments are refused. Uncertain operations retain original identities; recovery never resends."
      }
    ],
    "limitation": "CLI-only migration; no hosted executor, permission grant, fleet activation, secret read, receipt publication, or workflow dispatch. Missing rollout evidence remains unknown.",
    "followUp": "Run the preview in the intended checkout, review exact single-project actions and owner secret commands, then explicitly approve its digest. Machine changes require separate approval. Retain original recovery intents; publish receipts through a separately reviewed change and verify the dispatched rollout."
  },
  {
    "id": "cli.evidence-rederive",
    "command": "evidence rederive",
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
        "constraints": ""
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add immutable named measurement preview and bounded worker for its argv, followed by reviewed evidence update."
  },
  {
    "id": "cli.status",
    "command": "status",
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
        "constraints": ""
      }
    ],
    "limitation": "Bounded source-derived project summary; local checkout state and CLI project-name selector are not identical.",
    "followUp": "Expose goal/phase coverage and unavailable local-only sources."
  },
  {
    "id": "cli.next",
    "command": "next",
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
        "constraints": ""
      }
    ],
    "limitation": "Board next actions; no local worktree claim/fetch parity.",
    "followUp": "Add dedicated ready-phase detail and claim capability before claiming full parity."
  },
  {
    "id": "cli.goal-list",
    "command": "goal list",
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
        "constraints": ""
      }
    ],
    "limitation": "Home progress is not a full goals catalogue.",
    "followUp": "Add source-bound goals list/detail."
  },
  {
    "id": "cli.goal-show",
    "command": "goal show",
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
        "constraints": ""
      }
    ],
    "limitation": "Project summary is not goal detail.",
    "followUp": "Add goal route with phases and source gaps."
  },
  {
    "id": "cli.goal-add",
    "command": "goal add",
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
        "constraints": ""
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add source-bound preview and conditional Git writer for goals plus generated roadmap."
  },
  {
    "id": "cli.goal-retire",
    "command": "goal retire",
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
        "constraints": ""
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add reviewed retirement/move/supersede writer with exact affected phases."
  },
  {
    "id": "cli.phase-new",
    "command": "phase new",
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
        "constraints": ""
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add conditional phase scaffold and generated roadmap writer."
  },
  {
    "id": "cli.phase-claim",
    "command": "phase claim",
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
        "constraints": ""
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Implement durable claim/release with exact shared branch ownership and token checks."
  },
  {
    "id": "cli.ready",
    "command": "ready",
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
        "constraints": "--check repeated; command strings are local execution, never a web shell request."
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Requires an enrolled checkout and bounded approved check adapter; never accept arbitrary shell through browser."
  },
  {
    "id": "cli.integrate",
    "command": "integrate",
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
        "constraints": ""
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Requires single-integrator authority, isolated merge/check execution and durable publication receipts."
  },
  {
    "id": "cli.phase-list",
    "command": "phase list",
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
        "constraints": ""
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add complete bounded phase catalogue and coverage, beyond Home summary."
  },
  {
    "id": "cli.render",
    "command": "render",
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
        "constraints": ""
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add source-bound render preview and approved conditional patch writer; local --into remains local."
  },
  {
    "id": "cli.init",
    "command": "init",
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
        "constraints": ""
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Design explicit project creation/adoption workflow with resource approvals; local directory not remotely available."
  },
  {
    "id": "cli.adopt",
    "command": "adopt",
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
        "constraints": ""
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Design exact adoption proposal from source and explicit setup/check approval; local directories remain unsupported."
  },
  {
    "id": "cli.doctor",
    "command": "doctor",
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
        "constraints": "--fix consumes path then restore|eject; --yes authorizes that repair."
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add bounded diagnosis and exact restore/eject preview; do not overwrite user drift."
  },
  {
    "id": "cli.update",
    "command": "update",
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
        "constraints": "--local and --yes conflict."
      }
    ],
    "limitation": "Supported adopter update preparation and separately reviewed PR publication only; no --local/self CLI replacement.",
    "followUp": "Expose precise eligibility and unsupported local/self-update modes."
  },
  {
    "id": "cli.lessons",
    "command": "lessons",
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
        "constraints": ""
      }
    ],
    "limitation": "Shared catalogue is not issue-based lesson submission to upstream.",
    "followUp": "Design exact reviewed outbound lesson publication and original-receipt recovery."
  },
  {
    "id": "cli.learn",
    "command": "learn",
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
        "constraints": ""
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
        "constraints": ""
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
        "constraints": ""
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
        "constraints": ""
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
        "constraints": ""
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
        "constraints": ""
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
        "constraints": "Local evaluated-learning records only; no execution or promotion."
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
        "constraints": "Local evaluated-learning records only; no execution or promotion."
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
        "constraints": "Local binding and preregistered screening only; nonnull criteria require no prior execution. No execution or promotion."
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
        "constraints": "Local screening, exact review-package recording, rejection and dormant promotion/rollback observations. Missing provider/routing support blocks readiness; no external writes or installation."
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
        "constraints": "Explicit attributed follow-up; source set coverage only, eligible exposure and outcome/resource changes remain unknown. No polling or automatic reopening."
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
        "constraints": "Read-only deterministic public package from original verified report and mapping; no caller report or readiness flags, no files written."
      }
    ],
    "limitation": "Private shared catalogue/migration/export differs from mothership inbox gathering/proposal/decision/distillation.",
    "followUp": "Add separate source-owned inbox workflow; do not label catalogue as CLI learn."
  },
  {
    "id": "cli.improve",
    "command": "improve",
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
        "constraints": "sessions exclusive of report/transcripts/selftest; selftest exclusive of report/transcripts."
      }
    ],
    "limitation": "Existing health source observation only; no measure execution/report/session/selftest.",
    "followUp": "Expose source report; require a separately bounded measurement worker for execution."
  },
  {
    "id": "cli.persona-run",
    "command": "persona run",
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
        "constraints": "CLI strips --json; forwarded parseArgs accepts name together with --all; do not infer exclusive syntax from usage."
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Create a bounded registered persona measurement worker before exposing Run."
  },
  {
    "id": "cli.audit-due",
    "command": "audit due",
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
        "constraints": "CLI forwards to the practice parser; --quota and --quota-url name a snapshot file or a loopback URL only; no model is started."
      }
    ],
    "limitation": "No equivalent web execution currently implemented; the hosted room read is a later increment of phase 192.",
    "followUp": "Read the same quota snapshot from the hosted store before exposing due on the web."
  },
  {
    "id": "cli.audit-brief",
    "command": "audit brief",
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
        "constraints": "CLI forwards to the practice parser; prints a brief and writes nothing."
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Show the brief read-only beside the lens before any hosted audit run exists."
  },
  {
    "id": "cli.audit-record",
    "command": "audit record",
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
        "constraints": "CLI forwards to the practice parser; refuses, writing nothing, evidence that does not exist at the audited commit."
      }
    ],
    "limitation": "No equivalent web execution currently implemented; recording writes the checkout.",
    "followUp": "Create a bounded registered record worker with the same evidence checks before exposing Record."
  },
  {
    "id": "cli.audit-run",
    "command": "audit run",
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
        "constraints": "CLI parses with lib/audit-run.mjs parseRunArgs; without --yes it previews and makes nothing; with it, it runs only the owner's configured local host, once."
      }
    ],
    "limitation": "No equivalent web execution currently implemented; a run starts a local agent session on the owner's machine.",
    "followUp": "Keep runs local; a hosted run needs its own bounded worker, quota reservation and receipt recovery."
  },
  {
    "id": "cli.time",
    "command": "time",
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
        "constraints": ""
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add dated timing/coverage reader; no fabricated checkout measurements."
  },
  {
    "id": "cli.test",
    "command": "test",
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
        "constraints": ""
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "A separate bounded stalls worker is needed; typecheck-v1 does not implement arbitrary test files."
  },
  {
    "id": "cli.drain",
    "command": "drain",
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
        "constraints": ""
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Needs exact queue/PR snapshot, gate proof and explicit merge/close effects; human permission remains distinct."
  },
  {
    "id": "cli.night-plan",
    "command": "night plan",
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
        "constraints": ""
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add canonical plan generation/edit preview; private evening draft is not the shared branch."
  },
  {
    "id": "cli.night-tick",
    "command": "night tick",
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
        "constraints": ""
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add conditional monotonic tick writer with source revision and actor attribution."
  },
  {
    "id": "cli.morning",
    "command": "morning",
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
        "constraints": "send/card conflict; yes/dry-run require card; observation is read-only and conflicts with send/card/yes/dry-run."
      }
    ],
    "limitation": "Bounded source brief only; no --send issue or --card canvas publication.",
    "followUp": "Add exact source-date coverage; retain outbound actions unavailable until their durable adapter exists."
  },
  {
    "id": "cli.goodnight",
    "command": "goodnight",
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
        "constraints": "--yes only without subcommand; edit requires a valued change; duplicate values last-wins."
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
        "constraints": "--yes only without subcommand; edit requires a valued change; duplicate values last-wins."
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
        "constraints": "--yes only without subcommand; edit requires a valued change; duplicate values last-wins."
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
        "constraints": "--yes only without subcommand; edit requires a valued change; duplicate values last-wins."
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
        "constraints": "--yes only without subcommand; edit requires a valued change; duplicate values last-wins."
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
        "constraints": "--yes only without subcommand; edit requires a valued change; duplicate values last-wins."
      }
    ],
    "limitation": "Private evening draft supported; no canonical keel-night-plan publication, CLI budget or arbitrary item parity.",
    "followUp": "Show local/private draft boundary; design reviewed branch publication separately."
  },
  {
    "id": "cli.fleet",
    "command": "fleet",
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
        "constraints": ""
      }
    ],
    "limitation": "Private manifest fleet lens, not mothership plates.json/local checkout census.",
    "followUp": "Name manifest membership and missing local sources."
  },
  {
    "id": "cli.fleet-update",
    "command": "fleet update",
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
        "constraints": "yes/rehearse conflict; install/recover exclusive; install apply requires yes and digest together; recover normally rejects yes/digest/rehearse; restore-only requires recover and supports exact yes/digest apply; digest otherwise requires install."
      }
    ],
    "limitation": "Reviewed serial canary rollout of supported update preparation/publication; not blind all-fleet --yes. Source installation/recovery remains CLI-only; no hosted merge or workflow barrier authority.",
    "followUp": "Expose remaining unsupported repositories and rehearsal mode differences."
  },
  {
    "id": "cli.loose-ends",
    "command": "loose-ends",
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
        "constraints": ""
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
        "constraints": ""
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add bounded source-owned loose-end list/mark adapter; local chats/checkouts need enrolled local bridge."
  },
  {
    "id": "cli.sessions",
    "command": "sessions",
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
        "constraints": ""
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
        "constraints": ""
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
        "constraints": "push reads the device key from PLATES_DEVICE_KEY or the macOS keychain at run time and sends only the waiting-sessions snapshot to the named https workspace."
      }
    ],
    "limitation": "Local only: the hosted workspace receives the snapshot through its device-key route; nothing in the web runs this command.",
    "followUp": "None."
  },
  {
    "id": "cli.feedback",
    "command": "feedback",
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
        "constraints": "yes and digest supplied together; lowercase64hex; duplicate options rejected."
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
        "constraints": ""
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
        "constraints": ""
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
        "constraints": "yes/digest pair; record required."
      }
    ],
    "limitation": "Guided-walk feedback/repair subset does not expose general private CLI feedback store.",
    "followUp": "Add authenticated exact-result capture/list/propose/resolve handoff; preserve original observations."
  },
  {
    "id": "cli.issue",
    "command": "issue",
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
        "constraints": "agent/title/rubric required; unique."
      }
    ],
    "limitation": "Walk repair preview is not unrestricted issue new --agent dispatch.",
    "followUp": "Implement explicit reviewed robot issue adapter with preserved durable intent."
  },
  {
    "id": "cli.review",
    "command": "review",
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
        "constraints": ""
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
        "constraints": "--close selects this mode, not literal answer; one response kind; no wait/gate/reviewer."
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
        "constraints": "--class without --close selects mode, not literal classify."
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
        "constraints": "--file-agent-issue selects mode; --tracked BOOLEAN here; exactly one close/title/rubric; no fixed/not-valid."
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add exact comment/commit review reader and immutable answer/classification adapter; no blind bulk response."
  },
  {
    "id": "cli.home",
    "command": "home",
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
          },
          {
            "token": "--names-evidence",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "--project names one plate by its home id; JSON is /api/home's content without its transport fields. --names-evidence requires JSON and a positive observation repository ID; it forces a fresh read."
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
        "constraints": "Phase 173: one answer to one item in Needs you, through the writer its answer names; a preview (exit 3) until --yes. The web's POST /api/home/answer writes Not now and previews a health decision; it lists the writers it cannot run with this command."
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
        "constraints": "Phase 174: the docket one card at a time from stdin, in the order the web's /review session walks it; each answer is previewed through --answer's writer and written only after a yes. The web session holds an answer for five seconds with Undo instead. Phase 175: --quick walks only the quick ones (2 minutes or less each), as the web's /review?quick=1 does."
      },
      {
        "subcommand": null,
        "positionals": "--backlog",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--backlog",
            "arity": 0,
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
            "token": "--by-goal",
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
            "token": "--project",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--fresh",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "Read the backlog; --lane and --by-goal are mutually exclusive. --since requires YYYY-MM-DD. No hosted execution is enabled by this declaration."
      },
      {
        "subcommand": null,
        "positionals": "--recurring",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--recurring",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--project",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--fresh",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "Read routine schedules and observations; this does not schedule or execute a routine."
      },
      {
        "subcommand": null,
        "positionals": "--agents",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--agents",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--project",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--fresh",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "Read agent routes, claims and pull requests; this does not start an agent."
      },
      {
        "subcommand": null,
        "positionals": "--attach <key>",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--attach",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--route",
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
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "Local attach preview exits 3 until --yes; the selected route retains its claim, intent and receipt boundaries. No hosted adapter is enabled here."
      },
      {
        "subcommand": null,
        "positionals": "--cancel <key>",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--cancel",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--check",
            "arity": 0,
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
            "token": "--yes",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "limited"
          }
        ],
        "constraints": "Local cancel preview exits 3 until --yes; the cancel is recorded in the attach journal before it stops the run its receipt names or removes the brief. --check is read only and exits 1 when cancelled. No hosted adapter is enabled here."
      },
      {
        "subcommand": null,
        "positionals": "--assist <key>",
        "arguments": [
          {
            "token": "--json",
            "arity": 0,
            "repeat": "parser-specific",
            "treatment": "presentation-only"
          },
          {
            "token": "--assist",
            "arity": 1,
            "repeat": "parser-specific",
            "treatment": "limited"
          },
          {
            "token": "--recommend",
            "arity": 1,
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
            "token": "--evidence",
            "arity": 1,
            "repeat": "allowed",
            "treatment": "limited"
          },
          {
            "token": "--provider",
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
        "constraints": "Local decision draft preview exits 3 until --yes; evidence is repeatable. A draft never records an owner answer or phase acceptance. No hosted adapter is enabled here."
      }
    ],
    "limitation": "The hosted Home is the web form of this read model; sections the App cannot read are rows there, named with this command.",
    "followUp": "Keep plates home --json and /api/home equal for the same sources (tests/home-isomorphism.test.mjs)."
  },
  {
    "id": "cli.board",
    "command": "board",
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
        "constraints": "Any arguments: prints the replacement and exits 2; starts no server and reads nothing."
      }
    ],
    "limitation": "Retired; plates home and the hosted home are its two forms.",
    "followUp": "Remove the verb after one release, once no caller runs plates board."
  },
  {
    "id": "cli.channel",
    "command": "channel",
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
        "constraints": "Read only: reads claims, open pull requests, changes in flight, deploy records and this machine's waiting sessions through the readers plates home uses; stores, posts and writes nothing. --since narrows the seven-day window, never widens it."
      },
      {
        "subcommand": "inbox",
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
        "constraints": "Reads the owner's lines on this checkout's plate from the named https workspace with the device key, keeps those addressed to this session (PLATES_SESSION) or the phase this checkout claims, and moves this session's local cursor under the plates state dir so each is returned once; writes nothing remote. A source that cannot be read is a refusal and the cursor does not move."
      }
    ],
    "limitation": "Agents' own lines and the owner's lines are read from the workspace with the device key when PLATES_SITE names it, else a gap says why; the owner posts only from the signed-in site (/channel); unread counts the last 24 hours, with no read position kept.",
    "followUp": "Increment 4 mirrors lines that need the owner to the phase 149 Discord channel."
  },
  {
    "id": "cli.say",
    "command": "say",
    "forms": [
      {
        "subcommand": null,
        "positionals": "text:1",
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
        "constraints": "Posts one line of at most 280 characters for this checkout's plate to the named https workspace with the device key from PLATES_DEVICE_KEY or the macOS keychain, tagged with the session, provider and claimed phase; refused before anything is sent when it is too long, key-shaped, or there is no session, workspace or key. The workspace seals it (SQL024) and refuses a second line from one session within a minute."
      }
    ],
    "limitation": "Local only: the hosted workspace receives the line through its device-key route; nothing in the web runs this command. Lines are observations and trigger nothing.",
    "followUp": "An agent reads the owner's lines addressed to it with plates channel inbox."
  },
  {
    "id": "cli.promote",
    "command": "promote",
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
        "constraints": "CLI delegates unvalidated argv to installed scripts/plates/promote.mjs. This canonical grammar is only applicable after installed source identity/drift validation. --back supplies an optional commit (a Vercel target: none means the last deployment that passed); at most one commit. --watch, --migrated and --migrations-from are a Vercel target's only."
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Design reviewed deployment/rollback adapter with gate and serving-revision proofs, separate from update PR."
  },
  {
    "id": "cli.walk",
    "command": "walk",
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
        "constraints": ""
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
        "constraints": "accept optional explanation; decline requires explanation; map alternative. No --yes."
      }
    ],
    "limitation": "Authored guided walks; exact all-pass acceptance preview. Legacy health proposal decision separately supported; arbitrary CLI box/choice/map forms not universal.",
    "followUp": "Declare each supported authored target and mark unsupported legacy forms."
  },
  {
    "id": "cli.canvas",
    "command": "canvas",
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
        "constraints": "Strict form parser; canvas capture explicitly refused. Connect create XOR canvas + owner-only audience; render snapshot/output; sync snapshot/github and yes/dry-run exclusive; live keep/no-keep conflict; rebase yes requires onto."
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
        "constraints": "Strict form parser; canvas capture explicitly refused. Connect create XOR canvas + owner-only audience; render snapshot/output; sync snapshot/github and yes/dry-run exclusive; live keep/no-keep conflict; rebase yes requires onto."
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
        "constraints": "Strict form parser; canvas capture explicitly refused. Connect create XOR canvas + owner-only audience; render snapshot/output; sync snapshot/github and yes/dry-run exclusive; live keep/no-keep conflict; rebase yes requires onto."
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
        "constraints": "Strict form parser; canvas capture explicitly refused. Connect create XOR canvas + owner-only audience; render snapshot/output; sync snapshot/github and yes/dry-run exclusive; live keep/no-keep conflict; rebase yes requires onto."
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
        "constraints": "Strict form parser; canvas capture explicitly refused. Connect create XOR canvas + owner-only audience; render snapshot/output; sync snapshot/github and yes/dry-run exclusive; live keep/no-keep conflict; rebase yes requires onto."
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
        "constraints": "Strict form parser; canvas capture explicitly refused. Connect create XOR canvas + owner-only audience; render snapshot/output; sync snapshot/github and yes/dry-run exclusive; live keep/no-keep conflict; rebase yes requires onto."
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
        "constraints": "Strict form parser; canvas capture explicitly refused. Connect create XOR canvas + owner-only audience; render snapshot/output; sync snapshot/github and yes/dry-run exclusive; live keep/no-keep conflict; rebase yes requires onto."
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
        "constraints": "Strict form parser; canvas capture explicitly refused. Connect create XOR canvas + owner-only audience; render snapshot/output; sync snapshot/github and yes/dry-run exclusive; live keep/no-keep conflict; rebase yes requires onto."
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
        "constraints": "Strict form parser; canvas capture explicitly refused. Connect create XOR canvas + owner-only audience; render snapshot/output; sync snapshot/github and yes/dry-run exclusive; live keep/no-keep conflict; rebase yes requires onto."
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add authenticated canvas source/destination adapter with conditional remote version writes and recovery."
  },
  {
    "id": "cli.retro",
    "command": "retro",
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
        "constraints": ""
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
        "constraints": ""
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
        "constraints": "All options parse on each form; start/begin/finish/handoff require authored record. Status may configure from record; audit/apply/rollback refuse record. Domain controls --yes requirements."
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
        "constraints": "All options parse on each form; start/begin/finish/handoff require authored record. Status may configure from record; audit/apply/rollback refuse record. Domain controls --yes requirements."
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
        "constraints": "All options parse on each form; start/begin/finish/handoff require authored record. Status may configure from record; audit/apply/rollback refuse record. Domain controls --yes requirements."
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
        "constraints": "All options parse on each form; start/begin/finish/handoff require authored record. Status may configure from record; audit/apply/rollback refuse record. Domain controls --yes requirements."
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
        "constraints": "All options parse on each form; start/begin/finish/handoff require authored record. Status may configure from record; audit/apply/rollback refuse record. Domain controls --yes requirements."
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
        "constraints": "All options parse on each form; start/begin/finish/handoff require authored record. Status may configure from record; audit/apply/rollback refuse record. Domain controls --yes requirements."
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
        "constraints": "All options parse on each form; start/begin/finish/handoff require authored record. Status may configure from record; audit/apply/rollback refuse record. Domain controls --yes requirements."
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
        "constraints": "All options parse on each form; start/begin/finish/handoff require authored record. Status may configure from record; audit/apply/rollback refuse record. Domain controls --yes requirements."
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
        "constraints": "Explicit initialized external workspace and authorized comparison repository required. Plan and inspect read only. Freeze previews; --yes requires exact --digest. No execution, reservation or acceptance. Other operations refuse."
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
        "constraints": "Explicit initialized external workspace and authorized comparison repository required. Plan and inspect read only. Freeze previews; --yes requires exact --digest. No execution, reservation or acceptance. Other operations refuse."
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
        "constraints": "Explicit initialized external workspace and authorized comparison repository required. Plan and inspect read only. Freeze previews; --yes requires exact --digest. No execution, reservation or acceptance. Other operations refuse."
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
        "constraints": "Initialized private workspace and exact frozen plan. Schema1 offline descriptor preserves existing behavior and refuses --credential-fd. Schema2 live descriptor selects count or generation for one slot under host-gateway-v1; generation binds the original successful count and identical packet/model. Preview exits 3, writes nothing and reads no FD. Each stage requires separate exact --yes --digest approval, explicit price evidence and bounded spend/host admission. Live dispatch reads only an inherited pipe-json-v1 credential FD N>=3 on a supported host; metadata is not entitlement. Original operations never redispatch; uncertain usage stays held. No hosted activation or permission inference."
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
        "constraints": "Schema1 offline executions follow frozen pair order and run missing slots only after exact --yes --digest approval. Live aggregate resume refuses; no --credential-fd. Preserve original attempts, allowance and unknown costs. No hosted activation or permission inference."
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
        "constraints": "Legacy offline recovery preserves existing behavior and refuses --execution and --credential-fd. Live recovery requires --execution with a closed schema2 stage recovery descriptor, exactly one target, and mode provider-get or local-only. Preview exits 3, writes nothing and reads no FD; exact --yes --digest approves only the selected mode. Provider-get performs one separately quoted, bounded GET of the retained original response ID with an inherited pipe-json-v1 credential FD N>=3 on a supported host; no repeated POST or polling. Local-only rejects --credential-fd even on preview and performs no provider or spend operation. Host release does not release unknown money; preserve original acceptance and receipts. No hosted activation or permission inference."
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
        "constraints": "Preview and exact --yes --digest approve bounded local cancellation of original operations. No --execution or --credential-fd; no provider cancellation request or confirmation. Preserve uncertain reservations, original identities and verdicts. No hosted activation or permission inference."
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
        "constraints": "Read-only comparison of original attempts, failures, costs and coverage gaps. Unknown usage is not zero; retained results do not establish acceptance or live efficacy. No --yes, --digest, --execution or --credential-fd. No hosted activation or permission inference."
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
        "constraints": "Six exposed development cases; held-out zero. Read-only inspection; export previews exact bytes and writes a new private destination outside Git only with exact approval. No execution, no hosted or live-provider activation."
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
        "constraints": "Six exposed development cases; held-out zero. Read-only inspection; export previews exact bytes and writes a new private destination outside Git only with exact approval. No execution, no hosted or live-provider activation."
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
        "constraints": "CLI-only bounded metadata read. Repeated --repository and --pr-metadata pair by order; total limit 1..200, maximum ten repositories. No model identity, acceptance or task mapping inferred; no state writes or network calls. Other options refuse."
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
        "constraints": "CLI-only immutable metadata collection into an initialized private external workspace. Preview exits 3. --yes requires exact --digest; repeated input retains original receipt. Manifest authorizes projects; frozen references resolve to existing slots. No execution, routing or provider grant."
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
        "constraints": "CLI-only read of private observations, retained receipts and frozen reference coverage. Explicit initialized external workspace required. No writes, cleanup or provider calls; collection and report options refuse."
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
        "constraints": "CLI-only read-only scorecards. Optional prior report and fixed reference mix are bounded explicit JSON inputs. Unknown evidence and incomplete costs remain unknown. No routing changes, paid execution or hosted adapter."
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
        "constraints": "CLI-only local collection and immutable weekly report. Preview exits 3; exact --yes --digest binds local bundle, selected metadata and report inputs. Retains original report on recovery. No scheduler, automatic model calls or hosted adapter."
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
        "constraints": "CLI-only read-only disabled replay/crossover proposal. Evidence-bound workflows and required frozen inputs are described; currency budgets stay null and no provider dispatch is available. No hosted execution or routing changes."
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
        "constraints": "CLI-only explicit local stage events from a strict --record. Exact preview approval retains begin, start, finish, annotations, human/model adjudication and followup through the existing private ledger. No execution or hosted adapter."
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
        "constraints": "CLI-only read-only pending annotation queue. Frozen gaps, human judgments and delayed outcomes remain distinct. No mutation or model calls."
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Use local retro evaluations for frozen offline trials or separately approved one-slot live count/generation and original-operation recovery. Capability coverage grants no provider transfer, spend or permission; no hosted activation."
  },
  {
    "id": "cli.workspace",
    "command": "workspace",
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
        "constraints": ""
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
        "constraints": "Explicit absolute external paths; duplicate flags refused."
      }
    ],
    "limitation": "Hosted setup diagnostics do not create local external state or remote accounts.",
    "followUp": "Provide exact bootstrap instructions or enrolled local agent; retain terminal boundary."
  },
  {
    "id": "cli.shape",
    "command": "shape",
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
        "constraints": ""
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
        "constraints": ""
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
        "constraints": "yes requires reviewed digest in writeShape; digest without yes refused."
      }
    ],
    "limitation": "Answering supported shaping question is not check/render/plan of arbitrary draft.",
    "followUp": "Add bounded source-record validation/preview; separate plan commit approval."
  },
  {
    "id": "cli.decision",
    "command": "decision",
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
        "constraints": "Exactly one phase or issue required by resolver."
      }
    ],
    "limitation": "Canonical context consumed inside decisions/walks/model tasks; no general issue/phase context explorer route.",
    "followUp": "Add read-only context explorer with complete/not-configured/gaps distinction."
  },
  {
    "id": "cli.production",
    "command": "production",
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
        "constraints": "Shared parser accepts listed options across forms; domain chooses meaningful options. Default status; recover only affects status."
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
        "constraints": "Shared parser accepts listed options across forms; domain chooses meaningful options. Default status; recover only affects status."
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
        "constraints": "Shared parser accepts listed options across forms; domain chooses meaningful options. Default status; recover only affects status."
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
        "constraints": "Shared parser accepts listed options across forms; domain chooses meaningful options. Default status; recover only affects status."
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
        "constraints": "spec --rubric selects this special mode; only incident/rubric/yes/json allowed, not generic source/time flags."
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Add bounded collector and exact incident repair/verification adapters; absence is not healthy."
  },
  {
    "id": "cli.prove",
    "command": "prove",
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
        "constraints": "--fix consumes paths until next flag, repeatable; local isolated runner."
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Create separately approved isolated red/green runner and evidence preview; typecheck worker is insufficient."
  },
  {
    "id": "cli.release",
    "command": "release",
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
        "constraints": "--despite repeated repository + reason pair; --yes explicitly rejected. --notes - reads stdin. No version is release inspection."
      }
    ],
    "limitation": "No equivalent web execution currently implemented.",
    "followUp": "Create separately approved mothership release workflow with exact notes, rehearsal, gate, tag effects."
  },
  {
    "id": "cli.help",
    "command": "help",
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
        "constraints": ""
      }
    ],
    "limitation": "CLI text help is presentation, but web capability help is not yet complete.",
    "followUp": "Generate searchable capability help from shared registry."
  }
].map(entry => {
  const verb = verbs.get(entry.command);
  if (!verb) throw new Error(`Unregistered CLI capability: ${entry.command}`);
  return { ...entry, usage: verb.usage, summary: verb.summary };
});
