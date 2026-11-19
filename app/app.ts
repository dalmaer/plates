// The data module: answers the view's three reads from the bundled sample,
// cut to exactly the shapes app.contract declares. The sample is shaped as
// the hosted workspace answers (GET /api/home's glance, a project's simple
// model, GET /api/channel's lines), so increment 2 replaces the import with
// the fetch and keeps `cut*` as they are (DESIGN.md).
import type { Answer, Result, Sources } from './app.contract.d.ts';
import sample from './fixture/acme.json';

export const grants = '';

type Home = Result<'loadHome'>;
type Project = Result<'loadProjects'>[number];
type Line = Result<'loadChannel'>[number];

const cutHome = (glance: typeof sample.home.glance): Home => ({
  chips: glance.chips.map((c) => ({ projectId: c.projectId, name: c.name, tone: c.tone, reason: c.reason ?? '', more: c.more })),
  cards: glance.cards.map((c) => ({
    key: c.key,
    projectId: c.projectId,
    projectName: c.projectName,
    question: c.question,
    why: c.why ?? '',
    answers: c.answers.map((a) => ({
      id: a.id,
      label: a.label,
      recommended: 'recommended' in a && a.recommended === true,
      unavailable: 'unavailable' in a && a.unavailable ? a.unavailable.reason : '',
    })),
    more: c.more.map((m) => ({ label: m.label, text: m.text })),
    command: 'deploy' in c && c.deploy ? c.deploy.command : '',
  })),
});

const cutProject = (p: (typeof sample.projects)[keyof typeof sample.projects]): Project => ({
  projectId: p.projectId,
  name: p.name,
  items: p.items.map((i) => ({
    ref: i.ref,
    state: i.state,
    title: i.title,
    agent: i.holder?.provider ?? '',
    done: i.done ?? '',
    next: i.next ?? '',
    canAssign: i.canAssign,
    assign: i.assign.map((a) => ({ provider: a.provider, command: a.command, recommended: a.recommended })),
    assignWhy: i.canAssign ? (i.assignUnavailable ?? p.recommendation.why) : '',
  })),
  gaps: [...p.gaps],
});

const cutLine = (l: (typeof sample.channel.lines)[number], index: number): Line => ({
  id: `${l.at}#${index}`,
  at: l.at,
  plate: l.plate,
  kind: l.kind,
  actor: l.actor,
  session: 'session' in l && l.session ? l.session : '',
  text: l.text,
  answered: 'answered' in l && l.answered === true,
});

const sources: Sources = {
  loadHome: () => cutHome(sample.home.glance),
  loadProjects: () => Object.values(sample.projects).map(cutProject),
  loadChannel: () => sample.channel.lines.map(cutLine),
};
export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);
