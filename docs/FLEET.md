# ChatCMD Fleet — AI-Co and Living World workflow

Fleet is the multi-agent development mode used by this fork. It does not introduce a second scheduler or any GitHub runner infrastructure. It composes ChatCMD's existing subagents, browser bridge, Git/filesystem/process tools, task reports, and compact/resume support into one coordinator-driven development workflow.

The intended acceptance test for Fleet is real work: build this fork, connect it to ChatGPT, then use one coordinator conversation to continue AI-Co. Living World uses the same machinery with a different adversarial profile.

## Operating model

```text
user
  |
  v
coordinator ChatGPT conversation
  |
  +-- implementation owner(s) --- separate writable worktrees
  |
  +-- test / falsification child - separate ownership when modifying
  |
  +-- independent reviewer ------ fresh conversation, read-only
  |
  +-- deterministic execution --- local commands / Git / ordinary SSH
```

The coordinator owns decomposition, integration, the current candidate revision, and user communication. Children own bounded work and return evidence. Deterministic operations such as Git inspection, command execution, SSH, and waiting are performed by ChatCMD tools rather than by opening extra reasoning turns.

## No runners

Fleet assumes **no GitHub Actions runner infrastructure**. In particular, do not make project acceptance depend on self-hosted runners, hosted runners, or CI queues unless the user explicitly asks for them later.

Verification is performed against the real environments that matter:

- the local Windows checkout through ChatCMD process/Git/filesystem tools;
- remote Linux/ARM environments through ordinary `ssh` commands when useful;
- the actual ChatGPT browser bridge and worker tabs;
- a fresh independent review conversation bound to the exact candidate revision.

When a validation matters for acceptance, record the exact candidate revision and the environment/command that exercised it.

## Browser worker models

`agent_subagent_start` accepts an optional `model` field containing an **exact visible ChatGPT model label**. Supplying it deliberately selects the browser-extension route, even when the MCP peer also supports native sampling. This lets the coordinator route different roles to different visible models.

Do not encode assumptions about permanent model names into project logic. The labels available in ChatGPT can change. Use the labels currently visible to the signed-in account.

A typical policy is:

- coordinator: strongest reasoning model available for the project;
- implementer: fast/cost-efficient coding-capable model;
- adversarial independent reviewer: strongest reasoning model;
- diagnosis/research child: selected according to the task.

If the requested label is not visible in ChatGPT, browser dispatch will fail rather than silently pretending another model was used.

## Worktree ownership

Never let two modifying agents use the same checkout concurrently.

A practical Windows layout is:

```text
C:\dev\AI-Co-v2\main
C:\dev\_workers\AI-Co\AI-54-owner
C:\dev\_workers\AI-Co\AI-54-tests

C:\dev\Living-World\main
C:\dev\_workers\Living-World\LIV-xx-owner
C:\dev\_workers\Living-World\LIV-xx-tests
```

Create worktrees from an observed base revision and give each writable worker a descriptive branch. Before integration, inspect status and diff. Do not use reset/clean as routine coordination, and do not remove a worktree until its useful work has been committed/integrated or explicitly abandoned.

A reviewer should normally be read-only and does not need a writable worktree. Give it the exact base/head revisions and allow it to inspect the frozen candidate.

## Candidate and review rule

Fleet's central invariant is:

```text
candidate revision reviewed == candidate revision validated == candidate revision accepted
```

Any change to the candidate head invalidates previous PASS evidence. A review is not transferable to a descendant commit merely because the change looked small.

The independent reviewer must:

- be a fresh child/conversation that did not implement the candidate;
- receive the exact candidate revision and base revision;
- receive the relevant acceptance criteria/contracts;
- be read-only with respect to the reviewed candidate;
- actively seek counterexamples and invariant violations;
- return PASS or FAIL with concrete evidence and residual risks.

If it finds a defect, send the counterexample back to an implementation owner. After repair, freeze the new revision and review again.

## Owner falsification

Before handing off a candidate, the implementation owner performs an adversarial self-review. "Read the code again" is not sufficient. The owner should try to make the implementation violate its claimed properties and turn discovered counterexamples into tests when practical.

Useful pressure categories include malformed states, boundary values, lifecycle transitions, nested/composed inputs, retry/replay, stale references, alternate valid orderings, partial failure, and interactions with adjacent features.

## AI-Co profile

For AI-Co compiler work, the coordinator/owners/reviewer explicitly challenge, when relevant:

- exact projected type vs accidentally substituting the owner type;
- whole-root identity and immediate-parent lineage;
- Resource vs Free classification;
- Observation access rules;
- known vs dynamic indices and retained runtime checks;
- constant bounds diagnostics;
- nested/composed expressions and call arguments;
- opaque-owner projections;
- admission paths that bypass the intended validation point;
- native/differential behavior and regressions outside the happy path.

A normal issue flow is:

```text
recover live issue/repository state
  -> choose next unblocked slice
  -> create owner worktree/branch
  -> delegate implementation
  -> owner tests + falsification
  -> freeze exact candidate revision
  -> fresh independent read-only review
  -> FAIL: return counterexample to owner, new revision, review again
  -> PASS: integrate/merge according to the project's current authorization
```

## Living World profile

For Living World work, explicitly challenge:

- conservation/accounting totals;
- referent identity and lineage;
- lifecycle/staleness after deletion or replacement;
- same-wave composition;
- UNKNOWN/UNSUPPORTED epistemic fidelity;
- retry/replay and partial-failure atomicity;
- hash/order dependence;
- alternate valid operation orderings;
- accidental promotion of reconstruction/defaults/solver convenience into objective world truth.

The owner falsification pass and the independent reviewer are separate evidence. One never substitutes for the other.

## Local and OCI execution

Use ChatCMD's existing `command_run`, Git, shell, process, filesystem, and task tools for local execution. Fleet does not need a runner abstraction.

For an OCI/Linux target, use the machine's normal SSH configuration. For example, configure an alias such as `oci-dev` in the operating system's SSH config, keep private keys outside the repository, and execute bounded commands through `ssh`.

Conceptually:

```text
ssh oci-dev "cd /path/to/project && <validation command>"
```

The coordinator should report the actual target, revision, command, exit state, and relevant output. It must not infer a PASS from a successful connection alone.

## First real test: continue AI-Co

After building this fork and loading the ChatGPT extension, use a fresh coordinator conversation with the AI-Co project folder selected. A suitable first request is:

> Continue autonomous development of AI-Co from live project state. Use Fleet coordination: recover the current GitHub/Linear state, delegate only along real ownership boundaries, give modifying workers separate worktrees, require owner falsification, freeze an exact candidate revision before a fresh read-only independent review, invalidate review if the candidate changes, and use direct local/SSH execution rather than runners. Do not merge unless the current project workflow authorizes it.

The first run is expected to expose integration defects. Treat those as Fleet bugs to repair in this fork rather than masking them with manual coordination.

## Browser setup for the first run

The ChatGPT worker bridge is a Chromium extension. For the first Fleet test, use Chrome/Edge/Brave for the ChatCMD management page and worker ChatGPT tabs to remove cross-browser ambiguity:

1. Build/run this fork and open `http://127.0.0.1:8080`.
2. Create/connect the ChatCMD MCP profile as described in `docs/PLUGIN_SETUP.md`.
3. Load `chatgpt-extension/` unpacked in the same Chromium profile.
4. Sign in to ChatGPT in that profile and reload both ChatGPT and ChatCMD.
5. Set the allowed sub-agent count high enough for the desired worker concurrency.
6. Select the AI-Co project folder for the coordinator task.
7. Start with one implementation child plus one later independent reviewer before increasing parallelism.

Once the basic loop works reliably, additional independent implementation/test children can be introduced where their ownership is genuinely disjoint.
