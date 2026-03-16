---
title: "Everywhere all at once: the age of invisible machines"
description: "We spent years trying to make AI visible. Now it's disappearing — and that's the most important thing happening in tech right now."
date: "2026-03-16"
author: "Josh"
tags: ["AI", "agents", "ambient computing", "future of work", "agentic AI", "protoLabs"]
status: "approved"
review_score: 82
target: "protolabs.studio/blog or personal Substack"
seo:
  title: "The Age of Invisible Machines: AI Is Becoming Infrastructure"
  description: "We spent years trying to make AI visible. Now it's disappearing — and that's the most important thing happening in tech right now."
  keywords:
    - "agentic AI"
    - "AI infrastructure"
    - "ambient AI"
    - "invisible technology"
    - "autonomous agents"
    - "software development 2026"
---

# Everywhere all at once: the age of invisible machines

I built a feature last week. I don't mean I wrote code — I mean I described what I wanted,
and by morning it was built, tested, and sitting in a PR for my review.

The feature touched six files. The implementation was clean. I merged it.

I wrote zero lines of that code.

That sentence still catches me off guard. Not because it's miraculous — it isn't anymore —
but because of how *unremarkable* it felt. I noticed the feature was done the same way I
notice my email loaded: as background information, not as an event.

That's what I keep returning to. Not the capability. The mundanity of it.

---

## When technology disappears, it wins

There's a pattern to how transformative technologies mature. They arrive loud — announced
with fanfare, wielded as status symbols, the subject of breathless press releases and
breathless dread in equal measure. Then, quietly, they stop being *things* and start
being *conditions*.

Electricity was a novelty until it became a requirement. The internet was a destination
until it became an assumption. The smartphone was a luxury until forgetting it at home
felt like leaving the house without your keys.

Nobody says they're "going online" anymore. The question isn't whether you have internet —
it's why your connection is slow.

AI is doing the same thing. Faster, and to more layers of the stack at once.

In 2023, prompting an LLM was a party trick. In 2024, it was a competitive advantage.
In 2025, it started feeling like using a search engine — functional, expected, ambient.
Now, in early 2026, I'm watching it disappear entirely into how work gets done. Anthropic's
own [2026 Agentic Coding Trends Report](https://resources.anthropic.com/hubfs/2026%20Agentic%20Coding%20Trends%20Report.pdf?hsLang=en)
puts it plainly: we're shifting "from an activity centered on writing code to an activity
grounded in orchestrating agents."

The invisible machines are already running.

---

## What "everywhere" actually means

I want to be specific, because the vague "AI is everywhere" framing tends to produce
eye rolls — and fairly so. Most of those arguments just mean "there's a chatbot in your
software now." That's not what I'm describing.

I'm describing something more structural.

When I built protoLabs, the bet I was making wasn't that AI could write code. That was
already proven. The bet was that the *coordination layer* — the thing that decides what
to build, in what order, at what quality bar, and how to verify it worked — could also
be redesigned for AI to participate in.

What I've found is that the coordination layer was always the actual bottleneck. Not
writing code. Knowing *what* to write. Knowing *why* it matters. Knowing *when* to stop
and ship.

Those things required judgment. And now judgment is something you can partially delegate
— with appropriate oversight and appropriate humility about where it still fails.

The machines aren't everywhere in the sense that AI is in every product (though it is).
They're everywhere in the sense that the *work of thinking about work* is increasingly
running without you. Deloitte calls this the shift "from assistant to infrastructure."
When technology becomes infrastructure, it stops being optional.

---

## The uncomfortable part

Here is what nobody wants to say plainly.

When I describe this work as mundane, I mean my relationship to it has fundamentally
changed. I am more often the reviewer than the author. More often the architect of
systems than the implementer of their parts. More often the person who decides what's
worth building than the person who builds it.

Some people will read that and feel relief. Others will feel loss. I feel both.

There's something in the act of writing code that matters beyond the output. The
struggle with a problem. The clarity that comes from tracing a bug to its source at 2am.
The particular satisfaction of a clean abstraction discovered through iteration rather
than generation.

I don't want to pretend that disappearing is costless. Some of what disappears had value
we didn't know we were valuing.

And I want to name something harder: this transition is not neutral across people.
The productivity gains from agentic AI are real — but they accrue unevenly. The developer
who can direct agents effectively and verify their output becomes dramatically more
productive. The developer still learning their craft may find the feedback loop they
needed compressed away before they could benefit from it. The organizations that adopted
earliest are already operating at a different pace than those still debating pilots.

"Everywhere" doesn't mean *equally distributed*. It means the gap between those who have
it and those who don't is widening, fast.

---

## What the invisible machines can't do

I want to be honest about the failures.

The agents I work with daily are extraordinary at well-defined, bounded tasks. They are
poor at noticing when the task is wrong. They are poor at the kind of creative discomfort
that produces genuinely new ideas. They do not understand stakes. They understand
instructions.

This distinction matters enormously. An agent given a feature specification will implement
it. An agent noticing that the feature shouldn't exist requires something more — it
requires having been explicitly told to look for that. Which means a human had to think
to tell it. The human judgment is still load-bearing, just upstream.

The invisible machines need visible humans pointing them at the right problems.

I don't think that's a temporary limitation. I think it's structural. The most important
skill for this next decade isn't prompt engineering or agent orchestration or even
systems design.

It's knowing what's worth doing.

---

## What you can do about it now

If you're a developer or designer reading this and trying to figure out where to put
your energy, here is what I actually think:

**Stop optimizing to write code faster. Start optimizing to decide better.**

That means:

- **Practice writing precise specifications.** Ambiguity that a human colleague would
  resolve by asking is ambiguity an agent will resolve wrong.
- **Build your ability to verify, not just generate.** The review skill — reading code you
  didn't write, catching what's wrong, spotting what's missing — is becoming the
  differentiating skill.
- **Treat orchestration as a craft.** Designing workflows where agents, tools, and human
  checkpoints fit together correctly is real engineering work. It's not prompt engineering.
  It's architecture.
- **Stay close to the problem, not the solution.** The closer you stay to the actual human
  need you're solving for, the harder it is for generation-without-judgment to replace you.

None of this is easy. None of it is a replacement for technical depth. But the shape of
what matters is changing, and the people who recognize that early have a real advantage.

---

## A different kind of builder

I started writing software because I wanted to make things. Real things. Things that
worked when you pressed the button.

That feeling hasn't gone away. What's changed is the shape of the making.

I spend more time now in the space between ideas — figuring out the question before I
worry about the answer. Writing specifications precise enough for systems that don't
tolerate ambiguity. Designing workflows that produce the right thing at the right time
with the right degree of human oversight baked in.

This is its own craft. It's different from the craft I learned. I'm not sure it's easier.

But I am sure it's the craft of this moment. And the people who develop it — who learn
to think in systems, to work with autonomous agents as collaborators with real
limitations, to hold the full weight of *why* while the machines handle *how* — those
people are going to build things that weren't possible before.

The age of invisible machines isn't a story about replacement.

It's a story about what you can build when you stop carrying everything yourself.

---

**Try it yourself:** [protoLabs Studio](https://protolabs.studio) is the AI-native
development environment I've been building in public. It's where the autonomous features
and the workflows described above actually run. The best way to form your own view is
to get your hands on it.

**Want to go deeper?** Anthropic's
[2026 Agentic Coding Trends Report](https://resources.anthropic.com/hubfs/2026%20Agentic%20Coding%20Trends%20Report.pdf?hsLang=en)
is worth an hour of your time. And if you're thinking through what this means for your
team, I'm always thinking about it too — find me on
[Twitter/X](https://x.com).

---

*Originally published March 2026 on [protolabs.studio/blog](https://protolabs.studio/blog).*
